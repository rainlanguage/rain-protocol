// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../LibStackTop.sol";

/// @title OpSaturatingAdd
/// @notice Opcode for adding N numbers with saturating addition.
library OpSaturatingAdd {
    using SaturatingMath for uint256;

    function saturatingAdd(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        uint256 location_;
        uint256 accumulator_;
        uint256 cursor_;
        uint256 item_;
        assembly ("memory-safe") {
            location_ := sub(stackTop_, mul(operand_, 0x20))
            accumulator_ := mload(location_)
            cursor_ := add(location_, 0x20)
        }
        while (
            cursor_ < StackTop.unwrap(stackTop_) && accumulator_ < type(uint256).max
        ) {
            assembly ("memory-safe") {
                item_ := mload(cursor_)
                cursor_ := add(cursor_, 0x20)
            }
            accumulator_ = accumulator_.saturatingAdd(item_);
        }
        assembly ("memory-safe") {
            mstore(location_, accumulator_)
            stackTop_ := add(location_, 0x20)
        }
        return stackTop_;
    }
}
