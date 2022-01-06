// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Factory} from "../factory/Factory.sol";
import {Verify} from "./Verify.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title VerifyFactory
/// @notice Factory for creating and deploying `Verify` contracts.
contract VerifyFactory is Factory {
    address private immutable implementation;

    constructor() {
        implementation = address(new Verify());
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata data_)
        internal
        virtual
        override
        returns (address)
    {
        address admin_ = abi.decode(data_, (address));
        address clone_ = Clones.clone(implementation);
        Verify(clone_).initialize(admin_);
        return clone_;
    }

    /// Typed wrapper for `createChild` with admin address.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param admin_ `address` of the `Verify` admin.
    /// @return New `Verify` child contract address.
    function createChildTyped(address admin_) external returns (Verify) {
        return Verify(this.createChild(abi.encode(admin_)));
    }
}
