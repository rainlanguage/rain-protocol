// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable as ERC20Burnable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

/// @title ReserveToken18
/// A test token that can be used as a reserve asset.
/// On mainnet this would likely be some brand of stablecoin but can be
/// anything.
/// Notably mimics 18 decimals commonly used by ERC20.
contract ReserveToken18 is ERC20, ERC20Burnable {
    /// Accounts to freeze during testing.
    mapping(address => bool) public freezables;

    // Stables such as USDT and USDC commonly have 18 decimals.
    uint256 public constant DECIMALS = 18;
    // One _billion_ dollars 👷😈.
    uint256 public constant TOTAL_SUPPLY = 10 ** (DECIMALS + 9);

    /// Define and mint the erc20 token.
    function initialize() external initializer {
        __ERC20_init("USD Classic", "USDCC");
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return uint8(DECIMALS);
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
