// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";

/// @title OpGreaterThan
/// @notice Opcode to compare the top two stack values.
library OpGreaterThan {
    function greaterThan(uint256, StackTop stackTopLocation_)
        internal
        pure
        returns (StackTop)
    {
        assembly ("memory-safe") {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            let location_ := sub(stackTopLocation_, 0x20)
            mstore(location_, gt(mload(location_), mload(stackTopLocation_)))
        }
        return stackTopLocation_;
    }
}
