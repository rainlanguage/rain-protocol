// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../ierc3156/IERC3156FlashBorrower.sol";
import "../ierc3156/IERC3156FlashLender.sol";

/**
 * @author Alberto Cuesta Cañada
 * @dev Extension of {ERC20} that allows flash lending.
 */
contract OrderBookFlashLender is IERC3156FlashLender {
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    using SafeERC20 for IERC20;

    // token => receiver => active debt
    mapping(address => mapping(address => uint256)) internal activeFlashDebts;

    function _increaseFlashDebtThenSendToken(
        address token_,
        address receiver_,
        uint256 amount_
    ) internal {
        activeFlashDebts[token_][receiver_] += amount_;
        IERC20(token_).safeTransfer(receiver_, amount_);
    }

    function _decreaseFlashDebtThenSendToken(
        address token_,
        address receiver_,
        uint256 amount_
    ) internal {
        uint256 activeFlashDebt_ = activeFlashDebts[token_][receiver_];
        if (amount_ > activeFlashDebt_) {
            if (activeFlashDebt_ > 0) {
                delete activeFlashDebts[token_][receiver_];
            }

            IERC20(token_).safeTransfer(receiver_, amount_ - activeFlashDebt_);
        } else {
            activeFlashDebts[token_][receiver_] -= amount_;
        }
    }

    function _finalizeDebt(address token_, address receiver_) internal {
        uint256 activeFlashDebt_ = activeFlashDebts[token_][receiver_];
        if (activeFlashDebt_ > 0) {
            IERC20(token_).safeTransferFrom(
                receiver_,
                address(this),
                activeFlashDebt_
            );
            // Once we have the tokens safely in hand decrease the debt.
            activeFlashDebts[token_][receiver_] -= activeFlashDebt_;
        }
        require(activeFlashDebts[token_][receiver_] == 0, "BAD_DEBT");
    }

    /// @inheritdoc IERC3156FlashLender
    function flashLoan(
        IERC3156FlashBorrower receiver_,
        address token_,
        uint256 amount_,
        bytes calldata data_
    ) external override returns (bool) {
        _increaseFlashDebtThenSendToken(token_, address(receiver_), amount_);
        require(
            receiver_.onFlashLoan(msg.sender, token_, amount_, 0, data_) ==
                CALLBACK_SUCCESS,
            "FlashLender: Callback failed"
        );
        _finalizeDebt(token_, address(receiver_));
        return true;
    }

    /// @inheritdoc IERC3156FlashLender
    function flashFee(
        address,
        uint256
    ) external pure override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IERC3156FlashLender
    function maxFlashLoan(
        address token_
    ) external view override returns (uint256) {
        return IERC20(token_).balanceOf(address(this));
    }
}
