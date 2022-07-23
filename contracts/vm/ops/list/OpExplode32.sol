// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../LibStackTop.sol";
import "../../../array/LibUint256Array.sol";

/// @title OpExplode
/// @notice Opcode for exploding a single value into 8x 32 bit integers.
library OpExplode32 {
    using LibStackTop for StackTop;

    function explode32(uint256, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        (StackTop location_, uint256 i_) = stackTop_.peek();
        uint256 mask_ = uint256(type(uint32).max);
        return
            location_.push(
                i_ & mask_,
                (i_ >> 0x20) & mask_,
                (i_ >> 0x40) & mask_,
                (i_ >> 0x60) & mask_,
                (i_ >> 0x80) & mask_,
                (i_ >> 0xA0) & mask_,
                (i_ >> 0xC0) & mask_,
                (i_ >> 0xE0) & mask_
            );
    }
}
