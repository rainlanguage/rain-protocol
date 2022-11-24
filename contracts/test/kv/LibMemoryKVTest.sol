// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../kv/LibMemoryKV.sol";
import "../../debug/LibDebug.sol";

/// @title LibMemoryKVTest
/// Thin wrapper around `LibMemoryKV` library exposing methods for testing
contract LibMemoryKVTest {
    using LibMemoryKV for MemoryKV;
    using LibMemoryKV for MemoryKVPtr;
    using LibMemoryKV for MemoryKVKey;
    using LibMemoryKV for MemoryKVVal;

    /// Wraps `LibMemoryKV.readPtrVal`.
    function readPtrVal(MemoryKVPtr ptr_) external returns (MemoryKVVal) {
        LibDebug.dumpMemory();
        MemoryKVVal val_ = LibMemoryKV.readPtrVal(ptr_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKVVal.unwrap(val_));
        return val_;
    }

    /// Wraps `LibMemoryKV.getPtr`.
    function getPtr(
        MemoryKV kv_,
        MemoryKVKey k_
    ) external returns (MemoryKVPtr) {
        LibDebug.dumpMemory();
        MemoryKVPtr ptr_ = LibMemoryKV.getPtr(kv_, k_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKVPtr.unwrap(ptr_));
        return ptr_;
    }

    /// Wraps `LibMemoryKV.setVal`.
    function setVal(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) external returns (MemoryKV) {
        LibDebug.dumpMemory();
        MemoryKV kvSetVal_ = LibMemoryKV.setVal(kv_, k_, v_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKV.unwrap(kvSetVal_));
        return kvSetVal_;
    }

    /// Wraps `LibMemoryKV.toUint256Array`.
    function toUint256Array(
        MemoryKV kv_
    ) external returns (uint[] memory array_) {
        LibDebug.dumpMemory();
        array_ = LibMemoryKV.toUint256Array(kv_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(array_);
        return array_;
    }
}
