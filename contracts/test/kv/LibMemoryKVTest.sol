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
    
    // MemoryKV kv_;
    
    /// Wraps `LibMemoryKV.readPtrVal`.
    /// @param ptr ptr obtained from getPtr
    function readPtrVal(uint ptr) external pure returns (uint) {
        return MemoryKVVal.unwrap(MemoryKVPtr.wrap(ptr).readPtrVal());
    }

    /// Wraps `LibMemoryKV.getPtr`.
    /// @param k_ ptr obtained from getPtr
    function getPtr(uint kv_, uint k_) external pure returns(uint){
        return MemoryKVPtr.unwrap(
            MemoryKV.wrap(kv_).getPtr(
                MemoryKVKey.wrap(k_)
            )
        );
    }

    function setVal(uint kv_, uint k_, uint v_) external pure returns(uint){
        return MemoryKV.unwrap(
            MemoryKV.wrap(kv_).setVal(
                MemoryKVKey.wrap(k_), 
                MemoryKVVal.wrap(v_)
            )
        );
    }
    
    function toUint256Array(uint kv_) external pure returns(uint[] memory){
        return MemoryKV.wrap(kv_).toUint256Array();
    }
}
