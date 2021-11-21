// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Factory } from "../factory/Factory.sol";
import { Verify } from "./Verify.sol";

/// @title VerifyFactory
/// @notice Factory for creating and deploying `Verify` contracts.
contract VerifyFactory is Factory {

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (address admin_) = abi.decode(data_, (address));
        Verify verify_ = new Verify(admin_);
        return address(verify_);
    }

    /// Typed wrapper for `createChild` with admin address.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param admin_ `address` of the `Verify` admin.
    /// @return New `Verify` child contract address.
    function createChild(address admin_) external returns(address) {
        return this.createChild(abi.encode(admin_));
    }
}