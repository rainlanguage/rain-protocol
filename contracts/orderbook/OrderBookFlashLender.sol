// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../ierc3156/IERC3156FlashBorrower.sol";
import "../ierc3156/IERC3156FlashLender.sol";

/// Thrown when the `onFlashLoan` callback returns anything other than
/// ON_FLASH_LOAN_CALLBACK_SUCCESS.
/// @param result The value that was returned by `onFlashLoan`.
error FlashLenderCallbackFailed(bytes32 result);

/// Thrown when a debt fails to finalize.
/// @param token The token the debt is denominated in.
/// @param receiver The receiver of the debt that failed to finalize.
/// @param amount The amount of the token that was outstanding after attempting
/// final repayment.
error BadDebt(address token, IERC3156FlashBorrower receiver, uint256 amount);

/// @dev The ERC3156 spec mandates this hash be returned by `onFlashLoan`.
bytes32 constant ON_FLASH_LOAN_CALLBACK_SUCCESS = keccak256(
    "ERC3156FlashBorrower.onFlashLoan"
);

/// @dev Flash fee is always 0 for orderbook as there's no entity to take
/// revenue for `Orderbook` and its more important anyway that flashloans happen
/// to connect external liquidity to live orders via arbitrage.
uint256 constant FLASH_FEE = 0;

/// @title OrderBookFlashLender
/// @notice Implements `IERC3156FlashLender` for `OrderBook`. Based on the
/// reference implementation by Alberto Cuesta Cañada found at
/// https://eips.ethereum.org/EIPS/eip-3156
/// Several features found in the reference implementation are simplified or
/// hardcoded for `Orderbook`.
contract OrderBookFlashLender is IERC3156FlashLender {
    using SafeERC20 for IERC20;

    /// Tracks all active flash debts
    /// token => receiver => active debt
    mapping(address => mapping(IERC3156FlashBorrower => uint256)) internal activeFlashDebts;

    // /// Always increase the active debts before sending tokens to avoid potential
    // /// reentrancy issues. As long as the debt is increased on the `Orderbook`
    // /// before the tokens are transferred then any reentrancy will always face
    // /// the increased debt.
    // /// @param token_ The token to lend and send.
    // /// @param receiver_ The receiver of the token and debt.
    // /// @param amount_ The amount to lend and send.
    // function _increaseFlashDebtThenSendToken(
    //     address token_,
    //     address receiver_,
    //     uint256 amount_
    // ) internal {
    //     activeFlashDebts[token_][receiver_] += amount_;
    //     IERC20(token_).safeTransfer(receiver_, amount_);
    // }

    /// Whenever `Orderbook` sends tokens to any address it MUST first attempt
    /// to decrease any outstanding flash loans for that address. Consider the
    /// case that Alice deposits 100 TKN and she is the only depositor of TKN
    /// then flash borrows 100 TKN. If she attempts to withdraw 100 TKN during
    /// her `onFlashLoan` callback then `Orderbook`:
    ///
    /// - has 0 TKN balance to process the withdrawal
    /// - MUST process the withdrawal as Alice has the right to withdraw her
    /// balance at any time
    /// - Has the 100 TKN debt active under Alice
    ///
    /// In this case `Orderbook` can simply forgive Alice's 100 TKN debt instead
    /// of actually transferring any tokens. The withdrawal can decrease her
    /// vault balance by 100 TKN decoupled from needing to know whether a
    /// tranfer or forgiveness happened.
    ///
    /// The same logic applies to withdrawals as sending tokens during
    /// `takeOrders` as the reason for sending tokens is irrelevant, all that
    /// matters is that `Orderbook` prioritises debt repayments over external
    /// transfers.
    ///
    /// If there is an active debt that only partially eclipses the withdrawal
    /// then the debt will be fully repaid and the remainder transferred as a
    /// real token transfer.
    ///
    /// Note that Alice can still contrive a situation that causes `Orderbook`
    /// to attempt to send tokens that it does not have. If Alice can write a
    /// smart contract to trigger withdrawals she can flash loan 100% of the
    /// TKN supply in `Orderbook` and trigger her contract to attempt a
    /// withdrawal. For any normal ERC20 token this will fail and revert as the
    /// `Orderbook` cannot send tokens it does not have under any circumstances,
    /// but the scenario is worth being aware of for more exotic token
    /// behaviours that may not be supported.
    ///
    /// @param token_ The token being sent or for the debt being paid.
    /// @param receiver_ The receiver of the token or holder of the debt.
    /// @param amount_ The amount to send or repay.
    function _decreaseFlashDebtThenSendToken(
        address token_,
        address receiver_,
        uint256 amount_
    ) internal {
        uint256 activeFlashDebt_ = activeFlashDebts[token_][IERC3156FlashBorrower(receiver_)];
        if (amount_ > activeFlashDebt_) {
            if (activeFlashDebt_ > 0) {
                activeFlashDebts[token_][IERC3156FlashBorrower(receiver_)] -= activeFlashDebt_;
            }

            IERC20(token_).safeTransfer(receiver_, amount_ - activeFlashDebt_);
        } else {
            activeFlashDebts[token_][IERC3156FlashBorrower(receiver_)] -= amount_;
        }
    }

    // /// Before a `flashLoan` call can return ALL current debts MUST be finalized.
    // /// This means that the tokens MUST be returned from the receiver back to
    // /// `Orderbook`. If the token has a dynamic balance these calculations MAY
    // /// be wrong so dynamic balances and rebasing tokens are NOT SUPPORTED.
    // /// @param token_ The token the debt is being finalized for.
    // /// @param receiver_ The receiver of the token and holder of the outstanding
    // /// debt who must now immediately pay the tokens back.
    // function _finalizeDebt(address token_, address receiver_) internal {
    //     uint256 activeFlashDebt_ = activeFlashDebts[token_][receiver_];
    //     if (activeFlashDebt_ > 0) {
    //         // Take tokens from receiver before decreasing debt balance.
    //         IERC20(token_).safeTransferFrom(
    //             receiver_,
    //             address(this),
    //             activeFlashDebt_
    //         );
    //         // Once we have the tokens safely in hand decrease the debt.
    //         activeFlashDebts[token_][receiver_] -= activeFlashDebt_;
    //     }

    //     // This should be impossible but there is a potential reentrancy above
    //     // so guard against an unclean debt finalization anyway.
    //     uint256 finalDebt_ = activeFlashDebts[token_][receiver_];
    //     if (finalDebt_ > 0) {
    //         revert BadDebt(token_, receiver_, finalDebt_);
    //     }
    // }

    /// @inheritdoc IERC3156FlashLender
    function flashLoan(
        IERC3156FlashBorrower receiver_,
        address token_,
        uint256 amount_,
        bytes calldata data_
    ) external override returns (bool) {
        // _increaseFlashDebtThenSendToken(token_, address(receiver_), amount_);

        // Increase flash debt THEN send token.
        {
            activeFlashDebts[token_][receiver_] += amount_;
            IERC20(token_).safeTransfer(address(receiver_), amount_);
        }

        bytes32 result_ = receiver_.onFlashLoan(
            // initiator
            msg.sender,
            // token
            token_,
            // amount
            amount_,
            // fee
            0,
            // data
            data_
        );
        if (result_ != ON_FLASH_LOAN_CALLBACK_SUCCESS) {
            revert FlashLenderCallbackFailed(result_);
        }

        // _finalizeDebt(token_, address(receiver_));

        // Finalize the debt.
        {
            uint256 activeFlashDebt_ = activeFlashDebts[token_][receiver_];
            if (activeFlashDebt_ > 0) {
                // Take tokens from receiver before decreasing debt balance.
                IERC20(token_).safeTransferFrom(
                    address(receiver_),
                    address(this),
                    activeFlashDebt_
                );
                // Once we have the tokens safely in hand decrease the debt.
                activeFlashDebts[token_][receiver_] -= activeFlashDebt_;
            }

            // This should be impossible but there is a potential reentrancy above
            // so guard against an unclean debt finalization anyway.
            uint256 finalDebt_ = activeFlashDebts[token_][receiver_];
            if (finalDebt_ > 0) {
                revert BadDebt(token_, receiver_, finalDebt_);
            }
        }
        return true;
    }

    /// @inheritdoc IERC3156FlashLender
    function flashFee(
        address,
        uint256
    ) external pure override returns (uint256) {
        return FLASH_FEE;
    }

    /// There's no limit to the size of a flash loan from `Orderbook` other than
    /// the current tokens deposited in `Orderbook`.
    /// @inheritdoc IERC3156FlashLender
    function maxFlashLoan(
        address token_
    ) external view override returns (uint256) {
        return IERC20(token_).balanceOf(address(this));
    }
}
