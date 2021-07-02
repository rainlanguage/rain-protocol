// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../configurable-rights-pool/libraries/BalancerConstants.sol";

// An example token that can be used as a reserve asset.
// On mainnet this would likely be some brand of stablecoin but can be anything.
contract ReserveToken is ERC20 {
    // blacklist
    mapping(address => bool) public freezables;

    // One _billion_ dollars 👷😈
    uint256 public constant TOTAL_SUPPLY = 10 ** (18 + 9);

    constructor() public ERC20("USD Classic", "USDCC") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function ownerAddFreezable(address account_) external {
        freezables[account_] = true;
    }

    function ownerRemoveFreezable(address account_) external {
        freezables[account_] = false;
    }

    // burns all tokens
    function purge() external {
        _burn(msg.sender, balanceOf(msg.sender));
    }

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
