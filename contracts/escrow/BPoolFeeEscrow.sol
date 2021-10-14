// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { TrustFactory } from "../trust/TrustFactory.sol";
import { Trust, TrustContracts, DistributionStatus } from "../trust/Trust.sol";
import { IBPool } from "../pool/IBPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { IConfigurableRightsPool } from "../pool/IConfigurableRightsPool.sol";

contract BPoolFeeEscrow {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// This TrustFactory is checked on every call to ensure that only trusts
    /// with the same bytecode can be used by this escrow.
    /// REQUIRED because a malicious or buggy `Trust` can drain the escrow of
    /// all funds by cycling between success/failure states.
    /// Also the `TrustFactory` MUST correctly implement `isChild` or a
    /// malicious factory can behave reentrantly against `onlyFactoryTrust`.
    TrustFactory public immutable trustFactory;

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

    /// blocker => blockee => bool
    mapping(address => mapping(address => bool)) public blocked;

    constructor(TrustFactory trustFactory_) public {
        trustFactory = trustFactory_;
    }

    /// Public accessor by index for pending.
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
    /// @param reserve_ The token to a set minimium fees for.
    /// @param minFees_ The amount of reserve token to require a fee to be.
    function recipientSetMinFees(address reserve_, uint256 minFees_) external {
        require(minFees_ > 0, "MIN_FEES");
        minFees[msg.sender][reserve_] = minFees_;
    }

    /// Receipient can unset the fees for a reserve, thus opting out of further
    /// payments in that token.
    /// @param reserve_ The reserve to stop accepting.
    function recipientUnsetMinFees(address reserve_) external {
        delete minFees[msg.sender][reserve_];
    }

    /// Recipient can block any address, either a trust or fee sender, and the
    /// escrow will not accept fees originating from either.
    /// @param blockee_ The address to block sending funds to the recipient.
    function recipientBlockAccount(address blockee_) external {
        blocked[msg.sender][blockee_] = true;
    }

    /// Recipient can unblock an account. Inverse of `recipientblockAccount`.
    /// @param blockee_ The address to no longer block.
    function recipientUnblockAccount(address blockee_) external {
        delete blocked[msg.sender][blockee_];
    }

    /// Recipient can abandon fees from troublesome trusts with no function
    /// calls to external contracts.
    ///
    /// Catch-all solution for situations such as:
    /// - Malicious/buggy reserves
    /// - Gas griefing due to low min-fees
    /// - Regulatory/reputational concerns
    ///
    /// The trust is NOT automatically blocked when the current fees are
    /// abandoned. The sender MAY pay the gas to call `recipientBlockAccount`
    /// on the trust explicitly before calling `recipientAbandonTrust`.
    ///
    /// Abandoned fees become payable to the redeemable token.
    /// @param trust_ The trust to abandon.
    function recipientAbandonTrust(Trust trust_) external {
        uint256 abandonedFee_ = fees[address(trust_)][msg.sender];
        delete fees[address(trust_)][msg.sender];
        abandoned[address(trust_)] = abandoned[address(trust_)].add(
            abandonedFee_
        );
        failureRefunds[address(trust_)] = failureRefunds[address(trust_)].sub(
            abandonedFee_
        );
        // Ignore this because it doesn't represent success/fail of remove.
        bool didRemove_;
        didRemove_ = pending[msg.sender].remove(address(trust_));
    }

    /// Batch wrapper that loops over `anonClaimFees` up to an iteration limit.
    /// The iteration limit exists to keep gas under control in the case of
    /// many pending fees.
    /// @param feeRecipient_ Recipient to claim fees for.
    /// @param limit_ Maximum number of claims to process in this batch.
    function anonClaimFeesMulti(address feeRecipient_, uint256 limit_)
        external
    {
        limit_ = limit_.min(pending[feeRecipient_].length());
        uint256 i_ = 0;
        while (i_ < limit_) {
            anonClaimFees(
                // Keep hitting 0 because `pending` is mutated by `claimFees`
                // each iteration removing the processed claim.
                Trust(pending[feeRecipient_].at(0)),
                feeRecipient_
            );
            i_++;
        }
    }

    /// Anyone can pay the gas to send all claimable fees to any recipient.
    /// Security of delegated claims assumes the recipient only opts in to
    /// reserves that aren't going to try and do something "weird" like
    /// non-linear transfers.
    /// Claims are processed on a per-trust basis.
    /// Processing a claim before the trust distribution has reached either a
    /// success/fail state is a no-op.
    /// Processing a claim for a failed distribution simply deletes the record
    /// of claimable fees for the recipient.
    /// Processing a claim for a successful distribution transfers the accrued
    /// fees to the recipient.
    /// Processing a claim in the success/fail state removes it from the
    /// pending state.
    /// @param trust_ The trust to process claims for.
    ///
    function anonClaimFees(Trust trust_, address feeRecipient_) public {
        DistributionStatus distributionStatus_
            = Trust(trust_).getDistributionStatus();

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
            // is waiting for them to claim. Recipient is free to abandon and
            // even block a trust to completely opt out of a claim.
            if (fees[address(trust_)][feeRecipient_] > 0) {
                uint256 claimableFee_ = fees[address(trust_)][feeRecipient_];
                delete fees[address(trust_)][feeRecipient_];
                if (distributionStatus_ == DistributionStatus.Success) {
                    TrustContracts memory trustContracts_ = trust_
                        .getContracts();
                    IERC20(trustContracts_.reserveERC20).safeTransfer(
                        feeRecipient_,
                        claimableFee_
                    );
                }
            }
        }
    }

    /// Anyone can pay the gas to refund fees for a `Trust`.
    ///
    /// Refunding forwards the fees as `Trust` reserve to its redeemable token.
    /// Refunding does NOT directly return fees to the sendor nor directly to
    /// the `Trust`.
    ///
    /// The refund will forward BOTH:
    /// - Any abandoned fees at any time
    /// - All other fees collected if the raise fails
    ///
    /// This can be called many times to continue to forward abandoned fees.
    ///
    /// It is critical that a `Trust` never oscillates between Fail/Success.
    /// If this invariant is violated the escrow funds can be drained by first
    /// claiming a fail, then ALSO claiming fees for a success.
    ///
    /// @param trust_ The `Trust` to refund for.
    function anonRefundFees(Trust trust_) external {
        DistributionStatus distributionStatus_
            = trust_.getDistributionStatus();

        uint256 refund_ = abandoned[address(trust_)];

        if (refund_ > 0) {
            delete abandoned[address(trust_)];
        }

        if (
            failureRefunds[address(trust_)] > 0 &&
            (distributionStatus_ == DistributionStatus.Fail ||
                distributionStatus_ == DistributionStatus.Success)
        ) {
            if (distributionStatus_ == DistributionStatus.Fail) {
                refund_ = refund_.add(failureRefunds[address(trust_)]);
            }
            delete failureRefunds[address(trust_)];
        }

        if (refund_ > 0) {
            TrustContracts memory trustContracts_ = trust_.getContracts();
            IERC20(trustContracts_.reserveERC20).safeTransfer(
                trustContracts_.redeemableERC20,
                refund_
            );
        }
    }

    /// Unidirectional wrapper around `swapExactAmountIn` for "buying tokens".
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
    /// The end-user "chooses" (read: The FE sets the parameters for them) a
    /// recipient (the FE) and fee to be _added_ to their trade.
    ///
    /// Of course, the end-user can "simply" bypass the `buyToken` function
    /// call and interact with the pool themselves, but if a client front-end
    /// presents this to a user it's most likely they will just use it.
    ///
    /// This function does a lot of heavy lifting:
    /// - Ensure the `Trust` is a child of the factory this escrow is bound to
    /// - Ensure the fee recipient has not blocked the sender or the trust
    /// - Internal accounting to track fees for the fee recipient
    /// - Ensure the fee meets the minimum requirements of the receiver
    /// - Taking enough reserve tokens to cover the trade and the fee
    /// - Poking the weights on the underlying pool to ensure the best price
    /// - Performing the trade and forwading the token back to the caller
    ///
    /// Sadly this is gas intensive, it works out to a bit under double what it
    /// would cost to directly poke weights and do a swap as two actions. Doing
    /// the weights poke atomically with the trade has some nebulous benefit as
    /// it reduces the chance that someone else "uses" the benefit of the poke
    /// but overall it has to be said the gas situation is something to be
    /// mindful of. It certainly makes little sense to be doing this on L1.
    ///
    /// @param trust_ The `Trust` to buy tokens from.
    /// @param reserveAmountIn_ As per balancer.
    /// @param minTokenAmountOut_ As per balancer.
    /// @param maxPrice_ As per balancer.
    /// @param feeRecipient_ The recipient of the fee as `Trust` reserve.
    /// @param fee_ The amount of the fee.
    function buyToken(
        Trust trust_,
        uint256 reserveAmountIn_,
        uint256 minTokenAmountOut_,
        uint256 maxPrice_,
        address feeRecipient_,
        uint256 fee_
    )
        external
        returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
    {
        /// Requiring the trust is a child of the known factory means we know
        /// exactly how it operates internally, not only the interface.
        /// Without this check we'd need to guard against the `Trust`:
        /// - lying about distribution status to allow double dipping on fees
        /// - lying about reserve and redeemable tokens
        /// - with some kind of reentrancy or hard to reason about state change
        require(trustFactory.isChild(address(trust_)), "FACTORY_TRUST");

        // The fee recipient MUST NOT have blocked the sender.
        require(
            !blocked[feeRecipient_][msg.sender],
            "BLOCKED_SENDER"
        );
        // The fee recipient MUST NOT have blocked the trust.
        require(
            !blocked[feeRecipient_][address(trust_)],
            "BLOCKED_TRUST"
        );

        fees[address(trust_)][feeRecipient_] = fees[address(trust_)][
            feeRecipient_
        ].add(fee_);
        failureRefunds[address(trust_)] = failureRefunds[address(trust_)].add(
            fee_
        );
        // Ignore this because it doesn't represent success/fail of add.
        bool didAdd_;
        didAdd_ = pending[feeRecipient_].add(address(trust_));

        TrustContracts memory trustContracts_ = trust_.getContracts();
        require(
            fee_ > 0 &&
                fee_ >= minFees[feeRecipient_][trustContracts_.reserveERC20],
            "MIN_FEE"
        );
        require(
            minFees[feeRecipient_][trustContracts_.reserveERC20] > 0,
            "UNSET_FEE"
        );

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

        (uint256 tokenAmountOut_, uint256 spotPriceAfter_) = IBPool(
            trustContracts_.pool
        ).swapExactAmountIn(
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
