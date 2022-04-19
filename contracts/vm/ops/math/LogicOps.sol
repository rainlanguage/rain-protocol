// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

/// @title LogicOps
/// @notice RainVM opcode pack to perform some basic logic operations.
library LogicOps {
    function stackIndexMoveEveryAny(uint256 operand_, uint256 stackIndex_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            // Zero length EVERY and ANY is not supported.
            require(operand_ > 0, "BAD_LOGIC_OPERAND");
            // EVERY and ANY collapse operand_ as length of inputs to 1 output.
            return stackIndex_ - (operand_ - 1);
        }
    }

    // ISZERO
    function isZero(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            // The index doesn't change for iszero as there is
            // one input and output.
            let location_ := sub(stackTopLocation_, 0x20)
            mstore(location_, iszero(mload(location_)))
        }
        return stackTopLocation_;
    }

    // EAGER_IF
    // Eager because BOTH x_ and y_ must be eagerly evaluated
    // before EAGER_IF will select one of them. If both x_ and y_
    // are cheap (e.g. constant values) then this may also be the
    // simplest and cheapest way to select one of them.
    function eagerIf(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            let location_ := sub(stackTopLocation_, 0x60)
            stackTopLocation_ := add(location_, 0x20)
            // false => use second value
            // true => use first value
            mstore(
                location_,
                mload(
                    add(stackTopLocation_, mul(0x20, iszero(mload(location_))))
                )
            )
        }
        return stackTopLocation_;
    }

    function equalTo(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            let location_ := sub(stackTopLocation_, 0x20)
            mstore(location_, eq(mload(location_), mload(stackTopLocation_)))
        }
        return stackTopLocation_;
    }

    function lessThan(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            let location_ := sub(stackTopLocation_, 0x20)
            mstore(location_, lt(mload(location_), mload(stackTopLocation_)))
        }
        return stackTopLocation_;
    }

    function greaterThan(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            let location_ := sub(stackTopLocation_, 0x20)
            mstore(location_, gt(mload(location_), mload(stackTopLocation_)))
        }
        return stackTopLocation_;
    }

    // EVERY
    // EVERY is either the first item if every item is nonzero, else 0.
    // operand_ is the length of items to check.
    function every(uint256 operand_, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            let location_ := sub(stackTopLocation_, mul(operand_, 0x20))
            for {
                let cursor_ := location_
            } lt(cursor_, stackTopLocation_) {
                cursor_ := add(cursor_, 0x20)
            } {
                // If anything is zero then EVERY is a failed check.
                if iszero(mload(cursor_)) {
                    // Prevent further looping.
                    cursor_ := stackTopLocation_
                    mstore(location_, 0)
                }
            }
            stackTopLocation_ := add(location_, 0x20)
        }
        return stackTopLocation_;
    }

    // ANY
    // ANY is the first nonzero item, else 0.
    // operand_ id the length of items to check.
    function any(uint256 operand_, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        assembly {
            let location_ := sub(stackTopLocation_, mul(operand_, 0x20))
            for {
                let cursor_ := location_
            } lt(cursor_, stackTopLocation_) {
                cursor_ := add(cursor_, 0x20)
            } {
                // If anything is NOT zero then ANY is a successful
                // check and can short-circuit.
                let item_ := mload(cursor_)
                if iszero(iszero(item_)) {
                    // Prevent further looping.
                    cursor_ := stackTopLocation_
                    // Write the usable value to the top of the stack.
                    mstore(location_, item_)
                }
            }
            stackTopLocation_ := add(location_, 0x20)
        }
        return stackTopLocation_;
    }
}
