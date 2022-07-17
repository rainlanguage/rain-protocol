// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title Uint256Array
/// @notice Things we want to do carefully and efficiently with uint256 arrays
/// that Solidity doesn't give us native tools for.
library LibUint256Array {
    /// Extends `base_` with `extend_` by allocating additional `extend_.length`
    /// uints onto `base_`. Reverts if some other memory has been allocated
    /// after `base_` already, in which case it is NOT safe to copy inline.
    /// If `base_` is large this MAY be significantly more efficient than
    /// allocating `base_.length + extend_.length` for an entirely new array and
    /// copying both `base_` and `extend_` into the new array one item at a
    /// time in Solidity.
    /// @param base_ The base integer array that will be extended by `extend_`.
    /// @param extend_ The integer array that extends `base_`.
    function extend(uint256[] memory base_, uint256[] memory extend_)
        internal
        pure
    {
        uint256 freeMemoryPointer_;
        assembly {
            // Solidity stores free memory pointer at 0x40
            freeMemoryPointer_ := mload(0x40)
            let baseLength_ := mload(base_)
            let extendLength_ := mload(extend_)

            // The freeMemoryPointer_ does NOT point to the end of `base_` so
            // it is NOT safe to copy `extend_` over the top of already
            // allocated memory. This happens whenever some memory is allocated
            // after `base_` is allocated but before `extend` is called.
            if gt(
                freeMemoryPointer_,
                add(base_, add(0x20, mul(0x20, baseLength_)))
            ) {
                revert(0, 0)
            }

            // Move the free memory pointer by the length of extend_, excluding
            // the length slot of extend as that will NOT be copied to `base_`.
            mstore(0x40, add(freeMemoryPointer_, mul(0x20, extendLength_)))

            // Update the length of base to be the length of base+extend.
            mstore(base_, add(baseLength_, extendLength_))
        }

        unsafeCopyValuesTo(extend_, freeMemoryPointer_);
    }

    /// Copies `values_` to `location_` with NO attempt to check that this is
    /// safe to do so. The caller MUST ensure that there exists allocated
    /// memory at `location_` in which it is safe and appropriate to copy ALL
    /// `values_` to. Anything that was already written to memory at
    /// `[location:location+data_.length]` will be overwritten.
    /// The length of `values_` is NOT copied to the output location, ONLY the
    /// uint256 values of the `values_` array are copied.
    function unsafeCopyValuesTo(uint256[] memory values_, uint256 outputCursor_)
        internal
        pure
    {
        assembly {
            for {
                let inputCursor_ := add(values_, 0x20)
                let end_ := add(inputCursor_, mul(0x20, mload(values_)))
            } lt(inputCursor_, end_) {
                inputCursor_ := add(inputCursor_, 0x20)
                outputCursor_ := add(outputCursor_, 0x20)
            } {
                mstore(outputCursor_, mload(inputCursor_))
            }
        }
    }
}
