// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

/// @title Extrospection
/// @notice Exposes certain information available to evm opcodes as public
/// functions that are world callable.
contract Extrospection {
    function bytecodeHash(address address_) public view returns (bytes32) {
        bytes32 hash_;
        assembly ("memory-safe") {
            hash_ := extcodehash(address_)
        }
        return hash_;
    }
}