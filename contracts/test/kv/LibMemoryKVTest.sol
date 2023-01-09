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

    /// BEGIN IN-MEMORY SCENARIOS

    function scenario0(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) external pure returns (uint256[] memory array_) {
        kv_ = kv_.setVal(k_, v_);
        array_ = kv_.toUint256Array();
    }

    function scenario1(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) external pure returns (MemoryKVPtr ptr_) {
        kv_ = kv_.setVal(k_, v_);
        ptr_ = kv_.getPtr(k_);
    }

    function scenario2(
        MemoryKV kv_,
        MemoryKVKey k_
    ) external pure returns (MemoryKVPtr ptr_) {
        ptr_ = kv_.getPtr(k_);
    }

    function scenario3(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) external pure returns (MemoryKVVal val_) {
        kv_ = kv_.setVal(k_, v_);
        MemoryKVPtr ptr_ = kv_.getPtr(k_);
        val_ = ptr_.readPtrVal();
    }

    function scenario4(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v0_,
        MemoryKVVal v1_
    ) external returns (MemoryKVVal val_) {
        kv_ = kv_.setVal(k_, v0_);
        LibDebug.dumpMemory();
        kv_ = kv_.setVal(k_, v1_);
        LibDebug.dumpMemory();
        MemoryKVPtr ptr_ = kv_.getPtr(k_);
        val_ = ptr_.readPtrVal();
        LibDebug.emitEvent(MemoryKVVal.unwrap(val_));
    }

    function scenario5(
        MemoryKV kv_,
        MemoryKVKey k0_,
        MemoryKVVal v0_,
        MemoryKVKey k1_,
        MemoryKVVal v1_
    ) external pure returns (uint256[] memory array_) {
        kv_ = kv_.setVal(k0_, v0_);
        kv_ = kv_.setVal(k1_, v1_);
        array_ = kv_.toUint256Array();
    }

    function scenario6(
        MemoryKV kv0_,
        MemoryKV kv1_,
        MemoryKVKey k_,
        MemoryKVVal v0_,
        MemoryKVVal v1_
    ) external returns (MemoryKVVal val0_, MemoryKVVal val1_) {
        kv0_ = kv0_.setVal(k_, v0_);
        LibDebug.dumpMemory();
        kv1_ = kv1_.setVal(k_, v1_);
        LibDebug.dumpMemory();
        MemoryKVPtr ptr0_ = kv0_.getPtr(k_);
        val0_ = ptr0_.readPtrVal();
        MemoryKVPtr ptr1_ = kv1_.getPtr(k_);
        val1_ = ptr1_.readPtrVal();
        LibDebug.emitEvent(MemoryKVVal.unwrap(val0_));
        LibDebug.emitEvent(MemoryKVVal.unwrap(val1_));
    }

    function scenario7(
        MemoryKV kv_,
        uint256[] memory kvPair_
    ) external pure returns (uint256[] memory array_) {
        uint256 j = 0;
        for (uint256 i = 0; i < kvPair_.length - 1; i += 2) {
            j++;
            kv_ = kv_.setVal(
                MemoryKVKey.wrap(kvPair_[i]),
                MemoryKVVal.wrap(kvPair_[i + 1])
            );
        }
        array_ = kv_.toUint256Array();
    }

    /// END IN-MEMORY SCENARIOS

    /// Wraps `LibMemoryKV.readPtrVal`.
    function readPtrVal(MemoryKVPtr ptr_) public returns (MemoryKVVal val_) {
        LibDebug.dumpMemory();
        val_ = ptr_.readPtrVal();
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKVVal.unwrap(val_));
    }

    /// Wraps `LibMemoryKV.getPtr`.
    function getPtr(
        MemoryKV kv_,
        MemoryKVKey k_
    ) public returns (MemoryKVPtr ptr_) {
        LibDebug.dumpMemory();
        ptr_ = kv_.getPtr(k_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKVPtr.unwrap(ptr_));
    }

    /// Wraps `LibMemoryKV.setVal`.
    function setVal(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) public returns (MemoryKV kvSetVal_) {
        LibDebug.dumpMemory();
        kvSetVal_ = kv_.setVal(k_, v_);
        LibDebug.dumpMemory();
        LibDebug.emitEvent(MemoryKV.unwrap(kvSetVal_));
    }

    /// Wraps `LibMemoryKV.toUint256Array`.
    function toUint256Array(
        MemoryKV kv_
    ) public returns (uint256[] memory array_) {
        LibDebug.dumpMemory();
        array_ = kv_.toUint256Array();
        LibDebug.dumpMemory();
        LibDebug.emitEvent(array_);
    }
}
