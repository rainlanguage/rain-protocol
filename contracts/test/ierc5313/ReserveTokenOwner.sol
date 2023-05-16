// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable as ERC20Burnable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {EIP5313} from "../../ierc5313/IERC5313.sol";

/// @title ReserveTokenOwner
/// A test token that can be used as a reserve asset.
/// On mainnet this would likely be some brand of stablecoin but can be
/// anything.
/// Notably mimics 6 decimals commonly used by stables in production.
/// Additionally implements EIP5313 interface requiring `owner()` which
/// returns the address of the owner of this contract.
contract ReserveTokenOwner is ERC20, ERC20Burnable, EIP5313 {
    /// Accounts to freeze during testing.
    mapping(address => bool) public freezables;

    address internal owner_;

    // Stables such as USDT and USDC commonly have 6 decimals.
    uint256 public constant DECIMALS = 6;
    // One _billion_ dollars 👷😈.
    uint256 public constant TOTAL_SUPPLY = 10 ** (DECIMALS + 9);

    modifier onlyOwner() {
        require(msg.sender == owner_, "ONLY_OWNER");
        _;
    }

    /// Define and mint the erc20 token.
    function initialize() external initializer {
        __ERC20_init("USD Classic", "USDCC");
        _mint(msg.sender, TOTAL_SUPPLY);
        owner_ = msg.sender;
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

    // Overrides 5313 owner()
    function owner() external view override returns (address) {
        return owner_;
    }

    function transferOwnerShip(address newOwner) external onlyOwner {
        owner_ = newOwner;
    }
}
