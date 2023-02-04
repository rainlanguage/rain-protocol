// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

/// @title Extrospection
/// @notice Exposes certain information available to evm opcodes as public
/// functions that are world callable.
contract Extrospection {
    event BytecodeHash(address sender, bytes32 hash);

    function bytecodeHash(address address_) public view returns (bytes32) {
        bytes32 hash_;
        assembly ("memory-safe") {
            hash_ := extcodehash(address_)
        }
        return hash_;
    }

    function emitBytecodeHash(address address_) external {
        emit BytecodeHash(msg.sender, bytecodeHash(address_));
    }
}