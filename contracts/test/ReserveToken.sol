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

    constructor() public ERC20("USD Classic", "USDCC") {
        // One _billion_ dollars 👷😈
        _mint(msg.sender, SafeMath.mul(1000000000, BalancerConstants.BONE));
    }

    function ownerAddFreezable(address _address) external {
        freezables[_address] = true;
    }

    function ownerRemoveFreezable(address _address) external {
        freezables[_address] = false;
    }

    function _beforeTokenTransfer(
        address,
        address _receiver,
        uint256
    ) internal override {
        require(
            _receiver == address(0) || !(freezables[_receiver]),
            "ERR_FROZEN"
        );
    }
}
