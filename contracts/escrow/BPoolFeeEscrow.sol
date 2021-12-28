// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { FactoryTruster } from "../factory/FactoryTruster.sol";
import { IFactory } from "../factory/IFactory.sol";
import { Trust, TrustContracts, DistributionStatus } from "../trust/Trust.sol";
import { IBPool } from "../pool/IBPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant INFINITY
        = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

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

    /// trust => recipient => amount
    mapping(address => mapping(address => uint256)) public fees;

    /// trust => amount
    mapping(address => uint256) public aggregateFees;

    /// @param trustFactory_ `TrustFactory` that every `Trust` MUST be a child
    /// of. The security model of the escrow REQUIRES that the `TrustFactory`
    /// implements `IFactory` correctly and that the `Trust` contracts that it
    /// deploys are not buggy or malicious re: tracking distribution status.
    constructor(IFactory trustFactory_)
        FactoryTruster(trustFactory_)
        {} //solhint-disable-line no-empty-blocks

    /// Batch wrapper that loops over `anonClaimFees` for all passed trusts.
    /// @param feeRecipient_ Recipient to claim fees for.
    /// @param trusts_ Trusts to claim fees for.
    /// @return All the claimed fees from the inner loop.
    function anonClaimFeesMulti(address feeRecipient_, Trust[] memory trusts_)
        external
        returns (ClaimedFees[] memory)
    {
        ClaimedFees[] memory claimedFees_ = new ClaimedFees[](trusts_.length);
        for (uint256 i_ = 0; i_ < trusts_.length; i_++) {
            claimedFees_[i_] = ClaimedFees(address(trusts_[i_]), anonClaimFees(
                feeRecipient_,
                trusts_[i_]
            ));
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
            // Greater than zero rather than the current min fee as a recipient
            // may have recently changed their min fee to a number greater than
            // is waiting for them to claim. Recipient is free to abandon a
            // trust to completely opt out of a claim.
            claimableFee_ = fees[address(trust_)][feeRecipient_];
            emit ClaimFees(feeRecipient_, address(trust_), claimableFee_);
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
        uint256 refund_ = aggregateFees[address(trust_)];

        if (refund_ > 0) {
            DistributionStatus distributionStatus_
                = trust_.getDistributionStatus();
            if (distributionStatus_ == DistributionStatus.Fail ||
                distributionStatus_ == DistributionStatus.Success) {
                // Clear out the failure refund even if the raise succeeded.
                delete aggregateFees[address(trust_)];

                if (distributionStatus_ == DistributionStatus.Fail) {
                    emit RefundFees(address(trust_), refund_);
                    TrustContracts memory trustContracts_ = trust_
                        .getContracts();
                    IERC20(trustContracts_.reserveERC20).safeTransfer(
                        trustContracts_.redeemableERC20,
                        refund_
                    );
                }
            }
        }
        return refund_;
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
        fees[address(trust_)][feeRecipient_]
            = fee_ + fees[address(trust_)][feeRecipient_];
        aggregateFees[address(trust_)]
            = fee_ + aggregateFees[address(trust_)];

        TrustContracts memory trustContracts_ = trust_.getContracts();
        emit Fee(feeRecipient_, address(trust_), fee_);

        IERC20(trustContracts_.reserveERC20).safeTransferFrom(
            msg.sender,
            address(this),
            fee_ + reserveAmountIn_
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
                INFINITY
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
        return ((tokenAmountOut_, spotPriceAfter_));
    }
}
