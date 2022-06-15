// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

/// @title OpMax
/// @notice Opcode to stack the maximum of N numbers.
library OpMax {
    function max(uint256 operand_, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            let location_ := sub(stackTopLocation_, mul(operand_, 0x20))
            let accumulator_ := mload(location_)
            let cursor_ := add(location_, 0x20)
            let item_
            for {
                cursor_ := add(location_, 0x20)
            } lt(cursor_, stackTopLocation_) {
                cursor_ := add(cursor_, 0x20)
            } {
                item_ := mload(cursor_)
                if gt(item_, accumulator_) {
                    accumulator_ := item_
                }
            }
            mstore(location_, accumulator_)
            stackTopLocation_ := add(location_, 0x20)
        }
        return stackTopLocation_;
    }
}
