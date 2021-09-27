// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title ReserveToken
/// An example token that can be used as a reserve asset.
/// On mainnet this would likely be some stablecoin but can be anything.
contract ReserveTokenTest is ERC20 {
    /// How many tokens to mint initially.
    // One _billion_ dollars 👷😈
    uint256 public constant INITIAL_MINT = 10 ** 9;

    /// Test against frozen assets, for example USDC can do this.
    mapping(address => bool) public freezables;

    constructor() public ERC20("USD Classic", "USDCC") {
        _mint(msg.sender, SafeMath.mul(INITIAL_MINT, 10 ** 18));
    }

    /// Anyone in the world can freeze any address on our test asset.
    /// @param address_ The address to freeze.
    function addFreezable(address address_) external {
        freezables[address_] = true;
    }

    /// Anyone in the world can unfreeze any address on our test asset.
    /// @param address_ The address to unfreeze.
    function removeFreezable(address address_) external {
        freezables[address_] = false;
    }

    /// Burns all tokens held by the sender.
    function purge() external {
        _burn(msg.sender, balanceOf(msg.sender));
    }

    /// Enforces the freeze list.
    function _beforeTokenTransfer(
        address,
        address receiver_,
        uint256
    ) internal override {
        require(
            receiver_ == address(0) || !(freezables[receiver_]),
            "FROZEN"
        );
    }
}
