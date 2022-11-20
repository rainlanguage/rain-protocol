// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../math/Binary.sol";

type MemoryKV is uint;
type MemoryKVKey is uint;
type MemoryKVPtr is uint;
type MemoryKVVal is uint;

contract LibMemoryKV {
    function readPtrVal(MemoryKVPtr ptr_) internal pure returns (MemoryKVVal) {
        // This is ALWAYS a bug. It means the caller did not check if the ptr is
        // nonzero before trying to read from it.
        require(MemoryKVPtr.unwrap(ptr_) > 0, "INVALID_PTR");
        MemoryKVVal v_;
        assembly ("memory-safe") {
            v_ := mload(add(ptr_, 0x20))
        }
        return v_;
    }

    function getPtr(
        MemoryKV kv_,
        MemoryKVKey k_
    ) internal pure returns (MemoryKVPtr) {
        uint mask_ = MASK_16BIT;
        MemoryKVPtr ptr_;
        assembly ("memory-safe") {
            // loop until k found or give up if ptr is zero
            for {
                ptr_ := and(kv_, mask_)
            } iszero(iszero(ptr_)) {
                ptr_ := mload(add(ptr_, 0x40))
            } {
                if eq(k_, mload(ptr_)) {
                    break
                }
            }
        }
        return ptr_;
    }

    function setVal(
        MemoryKV kv_,
        MemoryKVKey k_,
        MemoryKVVal v_
    ) internal pure returns (MemoryKV) {
        MemoryKVPtr ptr_ = getPtr(kv_, k_);
        uint mask_ = MASK_16BIT;
        // update
        if (MemoryKVPtr.unwrap(ptr_) > 0) {
            assembly ("memory-safe") {
                mstore(add(ptr_, 0x20), v_)
            }
        }
        // insert
        else {
            assembly ("memory-safe") {
                // allocate new memory
                ptr_ := mload(0x40)
                mstore(0x40, add(ptr_, 0x60))
                // set k/v/ptr
                mstore(ptr_, k_)
                mstore(add(ptr_, 0x20), v_)
                mstore(add(ptr_, 0x40), and(kv_, mask_))
                // kv must point to new insertion and update array len
                kv_ := or(
                    // inc len by 2
                    shl(16, add(shr(16, kv_), 2)),
                    // set ptr
                    ptr_
                )
            }
        }
        return kv_;
    }

    function toUint256Array(
        MemoryKV kv_
    ) internal pure returns (uint[] memory) {
        unchecked {
            uint ptr_ = MemoryKV.unwrap(kv_) & MASK_16BIT;
            uint length_ = MemoryKV.unwrap(kv_) >> 16;
            uint[] memory arr_ = new uint[](length_);
            assembly ("memory-safe") {
                for {
                    let cursor_ := add(arr_, 0x20)
                    let end_ := add(cursor_, mul(mload(arr_), 0x20))
                } lt(cursor_, end_) {
                    cursor_ := add(cursor_, 0x20)
                    ptr_ := mload(add(ptr_, 0x40))
                } {
                    // key
                    mstore(cursor_, mload(ptr_))
                    cursor_ := add(cursor_, 0x20)
                    // value
                    mstore(cursor_, mload(add(ptr_, 0x20)))
                }
            }
            return arr_;
        }
    }
}
