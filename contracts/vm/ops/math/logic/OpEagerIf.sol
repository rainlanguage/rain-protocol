// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";

/// @title OpEagerIf
/// @notice Opcode for selecting a value based on a condition.
library OpEagerIf {
    /// Eager because BOTH x_ and y_ must be eagerly evaluated
    /// before EAGER_IF will select one of them. If both x_ and y_
    /// are cheap (e.g. constant values) then this may also be the
    /// simplest and cheapest way to select one of them.
    function eagerIf(uint256, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        assembly ("memory-safe") {
            let location_ := sub(stackTop_, 0x60)
            stackTop_ := add(location_, 0x20)
            // false => use second value
            // true => use first value
            mstore(
                location_,
                mload(add(stackTop_, mul(0x20, iszero(mload(location_)))))
            )
        }
        return stackTop_;
    }
}
