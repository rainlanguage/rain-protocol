// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../kv/LibMemoryKV.sol";

/// @title LibMemoryKVTest
/// Thin wrapper around `LibMemoryKV` library exposing methods for testing
contract LibMemoryKVTest {
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;
    using LibMemoryKV for MemoryKVKey;
    using LibMemoryKV for MemoryKVVal;

    /// Wraps `LibMemoryKV.readPtrVal`.
    function readPtrVal(MemoryKVPtr ptr_) external pure returns (MemoryKVVal) {
        return LibMemoryKV.readPtrVal(ptr_);
    }

    /// Wraps `LibMemoryKV.getPtr`.
    function getPtr(
        MemoryKV kv_,
        MemoryKVKey k_
    ) external pure returns (MemoryKVPtr) {
        return LibMemoryKV.getPtr(kv_, k_);
    }

    /// Wraps `LibMemoryKV.setVal`.
    function setVal(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) external pure returns (MemoryKV) {
        return LibMemoryKV.setVal(kv_, k_, v_);
    }

    /// Wraps `LibMemoryKV.toUint256Array`.
    function toUint256Array(
        MemoryKV kv_
    ) external pure returns (uint[] memory) {
        return LibMemoryKV.toUint256Array(kv_);
    }
}
