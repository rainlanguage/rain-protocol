// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @notice Test contract to act as mock child contract for `FactoryTest`.
contract FactoryChildTest is Initializable {
    /// Contract is constructing.
    /// @param sender `msg.sender` of the contract deployer.
    event Construct(address sender);

    /// Contract is initializing (being cloned by factory).
    /// @param sender `msg.sender` of the contract initializer (cloner).
    /// @param value just some value.
    event Initialize(address sender, uint256 value);

    constructor() {
        emit Construct(msg.sender);
    }

    function initialize(uint256 value_) external initializer {
        emit Initialize(msg.sender, value_);
    }
}
