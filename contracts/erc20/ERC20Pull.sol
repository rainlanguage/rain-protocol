// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Constructor config for `ERC20Pull`.
struct ERC20PullConfig {
    /// Token sender to bind to `pullERC20`.
    address sender;
    /// ERC20 token to bind to `pullERC20`.
    address token;
}

/// @title ERC20Pull
/// @notice Enables a contract to pull (transfer to self) some `IERC20` token
/// from a sender. Both the sender and token must be known and trusted by the
/// implementing contract at construction time, and are immutable.
///
/// This enables the `sender` to merely approve the implementing contract then
/// anon can call `pullERC20` to have those tokens transferred. In some cases
/// (e.g. distributing the proceeds of a raise) it is safer to only approve
/// tokens than to transfer (e.g. if there is some bug reverting transfers).
///
/// The `sender` is singular and bound at construction to avoid the situation
/// where EOA accounts inadvertantly "infinite approve" and lose their tokens.
///
/// The token is singular and bound at construction to avoid the situation
/// where anons can force the implementing contract to call an arbitrary
/// external contract.
contract ERC20Pull {
    using SafeERC20 for IERC20;

    event ERC20PullInitialize(
        address sender,
        address tokenSender,
        address token
    );

    /// The `sender` that this contract will attempt to pull tokens from.
    address private sender;
    /// The ERC20 token that this contract will attempt to pull to itself from
    /// `sender`.
    address private token;

    /// Initialize the sender and token.
    /// @param config_ `ERC20PullConfig` to initialize.
    function initializeERC20Pull(ERC20PullConfig memory config_) internal {
        // Sender and token MUST be set in the config. MAY point at a known
        // address that cannot approve the specified token to effectively
        // disable pull functionality.
        require(config_.sender != address(0), "ZERO_SENDER");
        require(config_.token != address(0), "ZERO_TOKEN");
        // Reinitialization is a bug.
        assert(sender == address(0));
        assert(token == address(0));
        sender = config_.sender;
        token = config_.token;
        emit ERC20PullInitialize(msg.sender, config_.sender, config_.token);
    }

    /// Attempts to transfer `amount_` of `token` to this contract.
    /// Relies on `token` having been approved for at least `amount_` by the
    /// `sender`. Will revert if the transfer fails due to `safeTransferFrom`.
    /// Also relies on `token` not being malicious.
    /// @param amount_ The amount to attempt to pull to the implementing
    /// contract.
    function pullERC20(uint256 amount_) external {
        IERC20(token).safeTransferFrom(sender, address(this), amount_);
    }
}
