// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { FactoryTruster } from "../factory/FactoryTruster.sol";
import { IFactory } from "../factory/IFactory.sol";
import { Trust, TrustContracts, DistributionStatus } from "../trust/Trust.sol";
import { IBPool } from "../pool/IBPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { IConfigurableRightsPool } from "../pool/IConfigurableRightsPool.sol";

/// Represents fees as they are claimed by a recipient on a per-trust basis.
/// Used to work around a limitation in the EVM re: how return values can be
/// structured in a dynamic length array when bulk-claiming.
struct ClaimedFees {
    // The trust that fees were claimed for.
    address trust;
    // The amount of fees that were claimed.
    // This is denominated in the reserve currency/token of the trust.
    uint256 claimedFees;
}

/// Escrow contract for fees IN ADDITION TO BPool fees.
/// The goal is to set aside some revenue for curators, infrastructure, and
/// anyone else who can convince an end-user to part with some extra tokens and
/// gas for escrow internal accounting on top of the basic balancer swap. This
/// is Rain's "pay it forward" revenue model, rather than trying to capture and
/// pull funds back to the protocol somehow. The goal is to incentivise many
/// ecosystems that are nourished by Rain but are not themselves Rain.
///
/// Technically this might look like a website/front-end prefilling an address
/// the maintainers own and some nominal fee like 1% of each trade. The fee is
/// in absolute numbers on this contract but a GUI is free to calculate this
/// value in any way it deems appropriate. The assumption is that end-users of
/// a GUI will not manually alter the fee, because if they would do that it
/// makes more sense that they would simply call the balancer swap function
/// directly and avoid even paying the gas required by the escrow contract.
///
/// Balancer pool fees natively set aside prorata for LPs ONLY. Our `Trust`
/// requires that 100% of the LP tokens and token supply are held by the
/// managing pool contract that the `Trust` deploys. Naively we could set a
/// fee on the balancer pool and have the contract that owns the LP tokens
/// attempt to divvy the volume fees out to FEs from some registry. The issue
/// is that the Balancer contracts are all outside our control so we have no
/// way to prevent a malicious end-user or FE lying about how they interact
/// with the Balancer pool. The only way to ensure that every trade accurately
/// sets aside fees is to put a contract in between the buyer and the pool
/// that can execute the trade sans fees on the buyers's behalf.
///
/// Some important things to note about fee handling:
/// - Fees are NOT forwarded if the raise fails according to the trust. Instead
///   they are forwarded to the redeemable token so buyers can redeem a refund.
/// - Fees are ONLY collected when tokens are purchased, thus contributing to
///   the success of a raise. When tokens are sold there are no additional fees
///   set aside by this escrow. Repeatedly buying/selling does NOT allow for
///   wash trading to claim additional fees as the user must pay the fee in
///   full in addition to the token spot price for every round-trip.
/// - Recipients MUST OPT IN to every reserve type they want to accept by first
///   setting a min fee. The escrow will not set aside garbage shitcoins for
///   recipients unless they explicitly ask for it. The escrow cannot prevent
///   garbage shitcoins from being sent to the recipient outside the escrow but
///   it can refuse to facilitate the process with its own precious storage.
/// - ANYONE can process a claim for a recipient and/or a refund for a trust.
///   Recipients SHOULD ONLY accept reserve currencies that they'd be willing
///   have processed unconditionally at any time by anyone.
/// - The security of the escrow is only as good as the implementation of the
///   `TrustFactory` it is deployed for. A malicious trust can "double spend"
///   funds from the escrow by lying about its pass/fail status to BOTH process
///   a "refund" to the "token" that can be any address it wants AND to forward
///   fees to the nominated recipient. An attacker could roll out many bad
///   trusts to drain the escrow. For this reason non-zero fees will only ever
///   be set aside by `buyToken` for trusts that are a child of the known trust
///   factory, and zero-fee claims are always noops, so malicious trusts can
///   only ever "double spend" 0 tokens.
///
/// We cannot prevent FEs implementing their own smart contracts to take fees
/// outside the scope of the escrow, but we aren't encouraging or implementing
/// it for them either.
///
/// A set of functions for recipients to manage their own incoming fees are
/// provided on the escrow contract:
/// - Set/unset min fees per-reserve
/// - Abandon fees set aside for them on a per-trust basis
///
/// There are no admin roles for the escrow, every recipient must manage their
/// incoming reserves, trusts and claims themselves.
contract BPoolFeeEscrow is FactoryTruster {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// The recipient has set minimum fees for the given reserve.
    /// A minFees value of `0` means the minimum fee was unset.
    /// ONLY emitted if the min fees changed value.
    event MinFeesChange(
        address indexed recipient,
        address indexed reserve,
        // [oldMinFees, newMinFees]
        uint256[2] minFeesDiff
    );
    /// The recipient has abandoned a trust.
    /// ONLY emitted if non-zero fees were abandoned.
    event AbandonTrust(
        address indexed recipient,
        address indexed trust,
        uint256 abandonedFees
    );
    /// A claim has been processed for a recipient.
    /// ONLY emitted if the trust has success/fail distribution status.
    event ClaimFees(
        address indexed recipient,
        address indexed trust,
        uint256 claimedFees
    );
    /// A refund has been processed for a trust.
    /// ONLY emitted if non-zero fees were refunded.
    event RefundFees(
        address indexed trust,
        uint256 refundedFees
    );
    /// A fee has been set aside for a recipient.
    event Fee(
        address indexed recipient,
        address indexed trust,
        uint256 fee
    );

    /// recipient => reserve => amount
    mapping(address => mapping(address => uint256)) public minFees;

    /// @dev recipient => trust
    /// @dev private due to compiler constraints.
    mapping(address => EnumerableSet.AddressSet) private pending;

    /// trust => recipient => amount
    mapping(address => mapping(address => uint256)) public fees;

    /// trust => amount
    mapping(address => uint256) public failureRefunds;
    /// trust => amount
    mapping(address => uint256) public abandoned;

    /// @param trustFactory_ `TrustFactory` that every `Trust` MUST be a child
    /// of. The security model of the escrow REQUIRES that the `TrustFactory`
    /// implements `IFactory` correctly and that the `Trust` contracts that it
    /// deploys are not buggy or malicious re: tracking distribution status.
    constructor(IFactory trustFactory_)
        public
        FactoryTruster(trustFactory_)
        {} //solhint-disable-line no-empty-blocks

    /// Public accessor by index for pending.
    /// Allows access into the private struct.
    /// @param feeRecipient_ The recipient claims are pending for.
    /// @param index_ The index of the pending claim.
    function getPending(address feeRecipient_, uint256 index_)
        external
        view
        returns(address)
    {
        return pending[feeRecipient_].at(index_);
    }

    /// Recipient can set the minimum fees they will accept per-reserve.
    /// This setting applies to all trusts and fee senders using this reserve.
    /// This has the effect of signalling the recipient accepts this reserve.
    /// Reserves that have no min fee cannot be forwarded to this recipient.
    /// Setting the fees to what they already are is a noop.
    /// @param reserve_ The token to a set minimium fees for.
    /// @param newMinFees_ The amount of reserve token to require a fee to be.
    /// @return The old min fees.
    function recipientSetMinFees(address reserve_, uint256 newMinFees_)
        external
        returns (uint256)
    {
        require(newMinFees_ > 0, "MIN_FEES");
        uint256 oldMinFees_ = minFees[msg.sender][reserve_];
        if (oldMinFees_ != newMinFees_) {
            minFees[msg.sender][reserve_] = newMinFees_;
            emit MinFeesChange(
                msg.sender,
                reserve_,
                [oldMinFees_, newMinFees_]
            );
        }
        return oldMinFees_;
    }

    /// Receipient can unset the fees for a reserve, thus opting out of further
    /// payments in that token. Unsetting fees that are already 0 is a noop.
    /// @param reserve_ The reserve to stop accepting.
    /// @return The fees before they were unset.
    function recipientUnsetMinFees(address reserve_)
        external
        returns (uint256)
    {
        uint256 oldMinFees_ = minFees[msg.sender][reserve_];
        if (oldMinFees_ > 0) {
            delete minFees[msg.sender][reserve_];
            emit MinFeesChange(msg.sender, reserve_, [oldMinFees_, 0]);
        }
        return oldMinFees_;
    }

    /// Recipient can abandon fees from troublesome trusts with no function
    /// calls to external contracts.
    ///
    /// Catch-all solution for situations such as:
    /// - Malicious/buggy reserves
    /// - Gas griefing due to low min-fees
    /// - Regulatory/reputational concerns
    ///
    /// It is important that this function does not call external contracts.
    /// Recipient MUST be able to safely walk away from malicious contracts.
    /// In the case of a malicious reserve the recipient SHOULD also unset the
    /// min fees for that reserve to prevent future malicious fees. In the case
    /// of a malicious trust the recipient should walk away from this escrow
    /// contract entirely as that implies a malicious `TrustFactory`.
    ///
    /// Abandoned fees become payable to the redeemable token.
    /// Abandoning `0` fees is a noop.
    /// @param trust_ The trust to abandon.
    /// @return The amount of fees abandoned.
    function recipientAbandonTrust(Trust trust_) external returns (uint256) {
        uint256 oldFees_ = fees[address(trust_)][msg.sender];
        if (oldFees_ > 0) {
            delete fees[address(trust_)][msg.sender];
            abandoned[address(trust_)] = abandoned[address(trust_)]
                .add(oldFees_);
            failureRefunds[address(trust_)] = failureRefunds[address(trust_)]
                .sub(oldFees_);
            // Ignore this because it doesn't represent success/fail of remove.
            bool didRemove_;
            didRemove_ = pending[msg.sender].remove(address(trust_));
            emit AbandonTrust(msg.sender, address(trust_), oldFees_);
        }
        return oldFees_;
    }

    /// Batch wrapper that loops over `anonClaimFees` up to an iteration limit.
    /// The iteration limit exists to keep gas under control in the case of
    /// many pending fees.
    /// @param feeRecipient_ Recipient to claim fees for.
    /// @param limit_ Maximum number of claims to process in this batch.
    /// @return All the claimed fees from the inner loop.
    function anonClaimFeesMulti(address feeRecipient_, uint256 limit_)
        external
        returns (ClaimedFees[] memory)
    {
        limit_ = limit_.min(pending[feeRecipient_].length());
        ClaimedFees[] memory claimedFees_ = new ClaimedFees[](limit_);
        uint256 i_ = 0;
        address trust_ = address(0);
        while (i_ < limit_) {
            // Keep hitting 0 because `pending` is mutated by `claimFees`
            // each iteration removing the processed claim.
            trust_ = pending[feeRecipient_].at(0);
            claimedFees_[i_] = ClaimedFees(trust_, anonClaimFees(
                feeRecipient_,
                Trust(trust_)
            ));
            i_++;
        }
        return claimedFees_;
    }

    /// Anyone can pay the gas to send all claimable fees to any recipient.
    /// Security of delegated claims assumes the recipient only opts in to
    /// reserves that aren't going to try and do something "weird" like
    /// non-linear transfers, external mint/burn or rebasing/elastic balances.
    /// Claims are processed on a per-trust basis.
    /// Processing a claim before the trust distribution has reached either a
    /// success/fail state is a no-op.
    /// Processing a claim for a failed distribution simply deletes the record
    /// of claimable fees for the recipient.
    /// Processing a claim for a successful distribution transfers the accrued
    /// fees to the recipient.
    /// Processing a claim in the success/fail state removes it from the
    /// pending state.
    /// @param feeRecipient_ The recipient of the fees.
    /// @param trust_ The trust to process claims for.
    /// @return The fees claimed.
    function anonClaimFees(address feeRecipient_, Trust trust_)
        public
        returns (uint256)
    {
        DistributionStatus distributionStatus_
            = Trust(trust_).getDistributionStatus();
        uint256 claimableFee_ = 0;

        // If the distribution status has not reached a clear success/fail then
        // don't touch any escrow contract state. No-op.
        // If there IS a clear success/fail we process the claim either way,
        // clearing out the escrow contract state for the claim.
        // Tokens are only sent to the recipient on success.
        if (
            distributionStatus_ == DistributionStatus.Success ||
            distributionStatus_ == DistributionStatus.Fail
        ) {
            // Ignore this because it doesn't represent success/fail of remove.
            bool didRemove_;
            // The claim is no longer pending as we're processing it now.
            didRemove_ = pending[feeRecipient_].remove(address(trust_));

            // Greater than zero rather than the current min fee as a recipient
            // may have recently changed their min fee to a number greater than
            // is waiting for them to claim. Recipient is free to abandon a
            // trust to completely opt out of a claim.
            claimableFee_ = fees[address(trust_)][feeRecipient_];
            if (claimableFee_ > 0) {
                delete fees[address(trust_)][feeRecipient_];
                if (distributionStatus_ == DistributionStatus.Success) {
                    TrustContracts memory trustContracts_ = trust_
                        .getContracts();
                    IERC20(trustContracts_.reserveERC20).safeTransfer(
                        feeRecipient_,
                        claimableFee_
                    );
                }
                else {
                    // If the distribution status is a fail then in real the
                    // claimable fee is 0. We've just deleted the recorded fee
                    // to earn the gas refund and NOT transferred anything at
                    // this point.
                    claimableFee_ = 0;
                }
            }
            emit ClaimFees(feeRecipient_, address(trust_), claimableFee_);
        }
        return claimableFee_;
    }

    /// Anyone can pay the gas to refund fees for a `Trust`.
    ///
    /// Refunding forwards the fees as `Trust` reserve to its redeemable token.
    /// Refunding does NOT directly return fees to the sender nor directly to
    /// the `Trust`.
    ///
    /// The refund will forward BOTH:
    /// - Any abandoned fees at any time
    /// - All other fees collected if the raise fails
    ///
    /// This can be called many times to continue to forward abandoned fees.
    /// A failed raise will only refund fees once.
    ///
    /// It is critical that a `Trust` never oscillates between Fail/Success.
    /// If this invariant is violated the escrow funds can be drained by first
    /// claiming a fail, then ALSO claiming fees for a success.
    ///
    /// @param trust_ The `Trust` to refund for.
    /// @return The total refund.
    function anonRefundFees(Trust trust_) external returns (uint256) {
        DistributionStatus distributionStatus_
            = trust_.getDistributionStatus();

        uint256 totalRefund_ = 0;
        uint256 abandoned_ = abandoned[address(trust_)];
        uint256 failureRefund_ = failureRefunds[address(trust_)];

        if (abandoned_ > 0) {
            delete abandoned[address(trust_)];
            totalRefund_ = totalRefund_.add(abandoned_);
        }

        if (
            failureRefund_ > 0 &&
            (distributionStatus_ == DistributionStatus.Fail ||
                distributionStatus_ == DistributionStatus.Success)
        ) {
            if (distributionStatus_ == DistributionStatus.Fail) {
                totalRefund_ = totalRefund_.add(failureRefund_);
            }
            // Clear out the failure refund even if the raise was a success.
            delete failureRefunds[address(trust_)];
        }

        if (totalRefund_ > 0) {
            TrustContracts memory trustContracts_ = trust_.getContracts();
            IERC20(trustContracts_.reserveERC20).safeTransfer(
                trustContracts_.redeemableERC20,
                totalRefund_
            );
            emit RefundFees(address(trust_), totalRefund_);
        }
        return totalRefund_;
    }

    /// Unidirectional wrapper around `swapExactAmountIn` for 'buying tokens'.
    /// In this context, buying tokens means swapping the reserve token IN to
    /// the underlying balancer pool and withdrawing the minted token OUT.
    ///
    /// The main goal is to establish a convention for front ends that drive
    /// traffic to a raise to collect some fee from each token purchase. As
    /// there could be many front ends for a single raise, and the fees are
    /// based on volume, the safest thing to do is to set aside the fees at the
    /// source in an escrow and allow each receipient to claim their fees when
    /// ready. This avoids issues like wash trading to siphon fees etc.
    ///
    /// The end-user 'chooses' (read: The FE sets the parameters for them) a
    /// recipient (the FE) and fee to be _added_ to their trade.
    ///
    /// Of course, the end-user can 'simply' bypass the `buyToken` function
    /// call and interact with the pool themselves, but if a client front-end
    /// presents this to a user it's most likely they will just use it.
    ///
    /// This function does a lot of heavy lifting:
    /// - Ensure the `Trust` is a child of the factory this escrow is bound to
    /// - Internal accounting to track fees for the fee recipient
    /// - Ensure the fee meets the minimum requirements of the receiver
    /// - Taking enough reserve tokens to cover the trade and the fee
    /// - Poking the weights on the underlying pool to ensure the best price
    /// - Performing the trade and forwading the token back to the caller
    ///
    /// Sadly this is gas intensive, it works out to a bit under double what it
    /// would cost to directly poke weights and do a swap as two actions. Doing
    /// the weights poke atomically with the trade has some nebulous benefit as
    /// it reduces the chance that someone else 'uses' the benefit of the poke
    /// but overall it has to be said the gas situation is something to be
    /// mindful of. It certainly makes little sense to be doing this on L1.
    ///
    /// @param feeRecipient_ The recipient of the fee as `Trust` reserve.
    /// @param trust_ The `Trust` to buy tokens from.
    /// @param fee_ The amount of the fee.
    /// @param reserveAmountIn_ As per balancer.
    /// @param minTokenAmountOut_ As per balancer.
    /// @param maxPrice_ As per balancer.
    function buyToken(
        address feeRecipient_,
        Trust trust_,
        uint256 fee_,
        uint256 reserveAmountIn_,
        uint256 minTokenAmountOut_,
        uint256 maxPrice_
    )
        external
        /// Requiring the trust is a child of the known factory means we know
        /// exactly how it operates internally, not only the interface.
        /// Without this check we'd need to guard against the `Trust`:
        /// - lying about distribution status to allow double spending fees
        /// - lying about reserve and redeemable tokens
        /// - with some kind of reentrancy or hard to reason about state change
        onlyTrustedFactoryChild(address(trust_))
        returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
    {
        fees[address(trust_)][feeRecipient_] = fees[address(trust_)][
            feeRecipient_
        ].add(fee_);
        failureRefunds[address(trust_)] = failureRefunds[address(trust_)]
        .add(fee_);
        // Ignore this because it doesn't represent success/fail of add.
        bool didAdd_;
        didAdd_ = pending[feeRecipient_].add(address(trust_));

        TrustContracts memory trustContracts_ = trust_.getContracts();
        uint256 minFees_ =
            minFees[feeRecipient_][trustContracts_.reserveERC20];
        require(fee_ > 0 && fee_ >= minFees_, "MIN_FEE");
        require(minFees_ > 0, "UNSET_FEE");

        IERC20(trustContracts_.reserveERC20).safeTransferFrom(
            msg.sender,
            address(this),
            reserveAmountIn_.add(fee_)
        );

        IConfigurableRightsPool(trustContracts_.crp).pokeWeights();

        if (
            IERC20(trustContracts_.reserveERC20).allowance(
                address(this),
                trustContracts_.pool
            ) < reserveAmountIn_
        ) {
            // Approving here rather than using safeApprove because we want
            // "infinite approval" for the pool.
            // This is safe ONLY if the trust factory MAKES IT SAFE.
            // That means the trust factory builds trusts that ONLY build pools
            // from the canonical Balancer bytecode.
            // If there is ANY WAY the pool address in `trustContracts` can do
            // reserve transfers outside of standard Balancer swaps then this
            // is an attack vector to DRAIN THE ESCROW via. this approval.
            // This is easy to confirm if you're using the factory contracts
            // in this repository as the balancer factories are `immutable`
            // on `RedeemableERC20PoolFactory`.
            require(IERC20(trustContracts_.reserveERC20).approve(
                trustContracts_.pool,
                uint256(-1)
            ), "APPROVE_FAIL");
        }

        (uint256 tokenAmountOut_, uint256 spotPriceAfter_) =
            IBPool(trustContracts_.pool)
                .swapExactAmountIn(
                    trustContracts_.reserveERC20,
                    reserveAmountIn_,
                    trustContracts_.redeemableERC20,
                    minTokenAmountOut_,
                    maxPrice_
                );
        IERC20(trustContracts_.redeemableERC20).safeTransfer(
            msg.sender,
            tokenAmountOut_
        );

        emit Fee(feeRecipient_, address(trust_), fee_);

        return ((tokenAmountOut_, spotPriceAfter_));
    }
}
