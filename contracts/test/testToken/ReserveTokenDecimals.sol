// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable as ERC20Burnable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

/// @title ReserveTokenDecimals
/// A test token that can be used as a reserve asset.
/// On mainnet this would likely be some brand of stablecoin but can be
/// anything.
/// Supports arbitrary decimals.
contract ReserveTokenDecimals is ERC20, ERC20Burnable {
    /// Accounts to freeze during testing.
    mapping(address => bool) public freezables;

    uint8 public immutable _decimals;
    uint256 public immutable initialSupply;

    constructor(uint256 decimals_) {
        _decimals = uint8(decimals_);
        // One _septillion_ dollars 👷😈.
        initialSupply = 10 ** (decimals_ + 24);
    }

    /// Define and mint the erc20 token.
    function initialize() external initializer {
        __ERC20_init("USD Classic", "USDCC");
        _mint(msg.sender, initialSupply);
    }

    /// @inheritdoc ERC20
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// Add an account to the freezables list.
    /// @param account_ The account to freeze.
    function addFreezable(address account_) external {
        freezables[account_] = true;
    }

    /// Block any transfers to a frozen account.
    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        require(!freezables[receiver_], "FROZEN");
    }
}
