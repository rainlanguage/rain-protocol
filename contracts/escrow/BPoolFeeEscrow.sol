// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {RedeemableERC20, Trust} from "../trust/Trust.sol";
import {IBPool} from "../pool/IBPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IConfigurableRightsPool} from "../pool/IConfigurableRightsPool.sol";
import "./TrustEscrow.sol";

/// Represents fees as they are claimed by a recipient on a per-trust basis.
/// Used to work around a limitation in the EVM i.e. return values must be
/// structured this way in a dynamic length array when bulk-claiming.
struct ClaimedFees {
    // The trust that fees were claimed for.
    address trust;
    // The amount of fees that were claimed.
    // This is denominated in the token claimed.
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
/// - Fees are NOT forwarded if the raise fails according to the Trust. Instead
///   they are forwarded to the redeemable token so buyers can redeem a refund.
/// - Fees are ONLY collected when tokens are purchased, thus contributing to
///   the success of a raise. When tokens are sold there are no additional fees
///   set aside by this escrow. Repeatedly buying/selling does NOT allow for
///   wash trading to claim additional fees as the user must pay the fee in
///   full in addition to the token spot price for every round-trip.
/// - ANYONE can process a claim for a recipient and/or a refund for a trust.
/// - The information about which trusts to claim/refund is available offchain
///   via the `Fee` event.
///
/// We cannot prevent FEs implementing their own smart contracts to take fees
/// outside the scope of the escrow, but we aren't encouraging or implementing
/// it for them either.
contract BPoolFeeEscrow is TrustEscrow {
    using SafeERC20 for IERC20;

    /// A claim has been processed for a recipient.
    /// ONLY emitted if non-zero fees were claimed.
    event ClaimFees(
        /// Anon who processed the claim.
        address sender,
        /// Recipient of the fees.
        address recipient,
        /// Trust the fees were collected for.
        address trust,
        /// Amount of fees claimed.
        uint256 claimedFees
    );
    /// A refund has been processed for a `Trust`.
    /// ONLY emitted if non-zero fees were refunded.
    event RefundFees(
        /// Anon who processed the refund.
        address sender,
        /// `Trust` the fees were refunded to.
        /// Fees go to the redeemable token, not the `Trust` itself.
        address trust,
        /// Amount of fees refunded.
        uint256 refundedFees
    );
    /// A fee has been set aside for a recipient.
    event Fee(
        /// Anon who sent fees.
        address sender,
        /// Recipient of the fee.
        address recipient,
        /// `Trust` the fee was set aside for.
        address trust,
        /// Amount of fee denominated in the reserve asset of the `trust`.
        uint256 fee
    );

    /// Fees set aside under a trust for a specific recipient.
    /// Denominated in the reserve asset of the trust.
    /// There can be many recipients for a single trust.
    /// Fees are forwarded to each recipient when they claim. The recipient
    /// receives all the fees collected under a trust in a single claim.
    /// Fee claims are mutually exclusive with refund claims.
    /// trust => recipient => amount
    mapping(address => mapping(address => uint256)) private fees;

    /// Refunds for a trust are the same as the sum of all its fees.
    /// Denominated in the reserve asset of the trust.
    /// Refunds are forwarded to the raise token created by the trust.
    /// Refunds are mutually exclusive with any fee claims.
    /// All fees are forwarded to the same token address which is singular per
    /// trust.
    /// trust => amount
    mapping(address => uint256) private totalFees;

    /// @param trustFactory_ forwarded to `TrustEscrow` only.
    constructor(address trustFactory_)
        TrustEscrow(trustFactory_)
    //solhint-disable-next-line no-empty-blocks
    {

    }

    /// Anon can pay the gas to send all claimable fees to any recipient.
    /// Caller is expected to infer profitable trusts for the recipient by
    /// parsing the event log for `Fee` events. Caller pays gas and there is no
    /// benefit to not claiming fees, so anon can claim for any recipient.
    /// Claims are processed on a per-trust basis.
    /// Processing a claim before the trust distribution has reached either a
    /// success/fail state is an error.
    /// Processing a claim for a failed distribution simply deletes the record
    /// of claimable fees for the recipient without sending tokens.
    /// Processing a claim for a successful distribution transfers the accrued
    /// fees to the recipient (and deletes the record for gas refund).
    /// Partial claims are NOT supported, to avoid anon griefing claims by e.g.
    /// claiming 95% of a recipient's value, leaving dust behind that isn't
    /// worth the gas to claim, but meaningfully haircut's the recipients fees.
    /// A 0 value claim is a noop rather than error, to make it possible to
    /// write a batch claim wrapper that cannot be griefed. E.g. anon claims N
    /// trusts and then another anon claims 1 of these trusts with higher gas,
    /// causing the batch transaction to revert.
    /// @param recipient_ The recipient of the fees.
    /// @param trust_ The trust to process claims for. MUST be a child of the
    /// trusted `TrustFactory`.
    /// @return The fees claimed.
    function claimFees(address recipient_, Trust trust_)
        public
        returns (uint256)
    {
        EscrowStatus escrowStatus_ = getEscrowStatus(trust_);
        require(escrowStatus_ == EscrowStatus.Success, "NOT_SUCCESS");

        uint256 amount_ = fees[address(trust_)][recipient_];

        // Zero `amount_` is noop not error.
        // Allows batch wrappers to be written that cannot be front run
        // and reverted.
        if (amount_ > 0) {
            // Guard against outputs exceeding inputs.
            // Last `receipient_` gets gas refund.
            totalFees[(address(trust_))] -= amount_;

            // Gas refund.
            delete fees[address(trust_)][recipient_];

            emit ClaimFees(msg.sender, recipient_, address(trust_), amount_);
            trust_.reserve().safeTransfer(recipient_, amount_);
        }
        return amount_;
    }

    /// Anon can pay the gas to refund fees for a `Trust`.
    /// Refunding forwards the fees as `Trust` reserve to its redeemable token.
    /// Refunding does NOT directly return fees to the sender nor directly to
    /// the `Trust`.
    /// The refund will forward all fees collected if and only if the raise
    /// failed, according to the `Trust`.
    /// This can be called many times but a failed raise will only have fees to
    /// refund once. Subsequent calls will be a noop if there is `0` refundable
    /// value remaining.
    ///
    /// @param trust_ The `Trust` to refund for. This MUST be a child of the
    /// trusted `TrustFactory`.
    /// @return The total refund.
    function refundFees(Trust trust_) external returns (uint256) {
        EscrowStatus escrowStatus_ = getEscrowStatus(trust_);
        require(escrowStatus_ == EscrowStatus.Fail, "NOT_FAIL");

        uint256 amount_ = totalFees[address(trust_)];

        // Zero `amount_` is noop not error.
        // Allows batch wrappers to be written that cannot be front run
        // and reverted.
        if (amount_ > 0) {
            // Gas refund.
            delete totalFees[address(trust_)];

            emit RefundFees(msg.sender, address(trust_), amount_);
            trust_.reserve().safeTransfer(address(trust_.token()), amount_);
        }
        return amount_;
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
    /// Despite the additional "hop" with the escrow sitting between the user
    /// and the pool this function is similar or even cheaper gas than the
    /// user poking, trading and setting aside a fee as separate actions.
    ///
    /// @param feeRecipient_ The recipient of the fee as `Trust` reserve.
    /// @param trust_ The `Trust` to buy tokens from. This `Trust` MUST be
    /// known as a child of the trusted `TrustFactory`.
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
    ) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter) {
        // Zero fee makes no sense, simply call `swapExactAmountIn` directly
        // rather than using the escrow.
        require(fee_ > 0, "ZERO_FEE");
        require(getEscrowStatus(trust_) == EscrowStatus.Pending, "ENDED");
        fees[address(trust_)][feeRecipient_] += fee_;
        totalFees[address(trust_)] += fee_;

        emit Fee(msg.sender, feeRecipient_, address(trust_), fee_);

        // Everything except reserve is built by a trusted `Trust`
        // (getEscrowStatus enforces this) but it shouldn't matter to the
        // integrity of the escrow.
        // A bad reserve could set itself up to be drained from the escrow, but
        // cannot interfere with other reserve balances.
        // e.g. rebasing reserves are NOT supported.
        // A bad token could fail to send itself to `msg.sender` which doesn't
        // hurt the escrow.
        // A bad crp or pool is not approved to touch escrow fees, only the
        // `msg.sender` funds.
        IERC20 reserve_ = trust_.reserve();
        RedeemableERC20 token_ = trust_.token();
        IConfigurableRightsPool crp_ = trust_.crp();
        address pool_ = crp_.bPool();

        crp_.pokeWeights();

        // These two calls are to the reserve, which we do NOT know or have any
        // control over. Even a well known `Trust` can set a badly behaved
        // reserve.
        IERC20(reserve_).safeTransferFrom(
            msg.sender,
            address(this),
            fee_ + reserveAmountIn_
        );
        // The pool is never approved for anything other than this swap so we
        // can set the allowance directly rather than increment it.
        IERC20(reserve_).safeApprove(pool_, reserveAmountIn_);

        // Perform the swap sans fee.
        (uint256 tokenAmountOut_, uint256 spotPriceAfter_) = IBPool(pool_)
            .swapExactAmountIn(
                address(reserve_),
                reserveAmountIn_,
                address(token_),
                minTokenAmountOut_,
                maxPrice_
            );
        // Return the result of the swap to `msg.sender`.
        IERC20(address(token_)).safeTransfer(msg.sender, tokenAmountOut_);
        // Mimic return signature of `swapExactAmountIn`.
        return ((tokenAmountOut_, spotPriceAfter_));
    }
}
