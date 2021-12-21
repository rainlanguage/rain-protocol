// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Verify } from "../verify/Verify.sol";
import { Factory } from "../factory/Factory.sol";
import { VerifyTier } from "./VerifyTier.sol";

/// @title VerifyTierFactory
/// @notice Factory for creating and deploying `VerifyTier` contracts.
contract VerifyTierFactory is Factory {

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (Verify verify_) = abi.decode(data_, (Verify));
        VerifyTier verifyTier_ = new VerifyTier(verify_);
        return address(verifyTier_);
    }

    /// Typed wrapper for `createChild` with `Verify`.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param verify_ `Verify` of the `VerifyTier` logic.
    /// @return New `VerifyTier` child contract address.
    function createChild(Verify verify_) external returns(address) {
        return this.createChild(abi.encode(verify_));
    }
}