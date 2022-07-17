// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../LibStackTop.sol";

/// @title OpSaturatingSub
/// @notice Opcode for subtracting N numbers with saturating subtraction.
library OpSaturatingSub {
    using SaturatingMath for uint256;

    function saturatingSub(uint256 operand_, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        uint256 location_;
        uint256 accumulator_;
        uint256 cursor_;
        uint256 item_;
        assembly {
            location_ := sub(stackTop_, mul(operand_, 0x20))
            accumulator_ := mload(location_)
            cursor_ := add(location_, 0x20)
        }
        while (cursor_ < StackTop.unwrap(stackTop_) && 0 < accumulator_) {
            assembly {
                item_ := mload(cursor_)
                cursor_ := add(cursor_, 0x20)
            }
            accumulator_ = accumulator_.saturatingSub(item_);
        }
        assembly {
            mstore(location_, accumulator_)
            stackTop_ := add(location_, 0x20)
        }
        return stackTop_;
    }
}
