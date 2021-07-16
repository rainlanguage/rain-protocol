// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

/// @title ReserveToken
/// An test token that can be used as a reserve asset.
/// On mainnet this would likely be some brand of stablecoin but can be anything.
contract ReserveToken is ERC20, ERC20Burnable {
    /// Accounts to freeze during testing.
    mapping(address => bool) public freezables;

    // One _billion_ dollars 👷😈.
    uint256 public constant TOTAL_SUPPLY = 10 ** (18 + 9);
    // Stables such as USDT and USDC commonly have 6 decimals.
    uint8 public constant DECIMALS = 6;

    /// Define and mint the erc20 token.
    constructor() public ERC20("USD Classic", "USDCC") {
        _setupDecimals(DECIMALS);
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    /// Add an account to the freezable list.
    /// @param account_ The account to freeze.
    function addFreezable(address account_) external { freezables[account_] = true; }

    /// Remove an account from the freezables list.
    /// @param account_ The account to unfreeze.
    function removeFreezable(address account_) external { freezables[account_] = false; }

    /// Block any transfers to a frozen account.
    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address,
        address receiver_,
        uint256
    ) internal virtual override { require(!freezables[receiver_], "FROZEN"); }
}
