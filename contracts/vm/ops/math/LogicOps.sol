// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

    uint256 constant OPCODE_ISZERO = 0;
    uint256 constant OPCODE_EAGER_IF = 1;
    uint256 constant OPCODE_EQUAL_TO = 2;
    uint256 constant OPCODE_LESS_THAN = 3;
    uint256 constant OPCODE_GREATER_THAN = 4;
    uint256 constant OPCODE_EVERY = 5;
    uint256 constant OPCODE_ANY = 6;
    /// Number of provided opcodes for `LogicOps`.
    /// The opcodes are NOT listed on the library as they are all internal to
    /// the assembly and yul doesn't seem to support using solidity constants
    /// as switch case values.
    uint256 constant OPS_LENGTH = 7;

/// @dev Number of provided opcodes for `LogicOps`.
/// The opcodes are NOT listed on the library as they are all internal to
/// the assembly and yul doesn't seem to support using solidity constants
/// as switch case values.
uint256 constant LOGIC_OPS_LENGTH = 7;

/// @title LogicOps
/// @notice RainVM opcode pack to perform some basic logic operations.
library LogicOps {

    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        internal
        pure
        returns (int256)
    {
        if (opcode_ == OPCODE_ISZERO) {
            // ISZERO negates a value in place.
            return 0;
        } else if (opcode_ == OPCODE_EAGER_IF) {
            // Ternary IF collapses 3 inputs into 1 output.
            return -2;
        } else if (opcode_ < OPCODE_EVERY) {
            // All comparisons collapse 2 inputs into 1 output.
            return -1;
        } else {
            // Zero length EVERY and ANY is not supported.
            require(operand_ > 0, "BAD_OPERAND");
            // EVERY and ANY collapse operand_ as length of inputs to 1 output.
            return 1 - int256(operand_);
        }
    }

    function applyOp(
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure returns (uint256) {
        assembly {
            switch opcode_
            // ISZERO
            case 0 {
                // The index doesn't change for iszero as there is
                // one input and output.
                let location_ := sub(stackTopLocation_, 0x20)
                mstore(location_, iszero(mload(location_)))
            }
            // EAGER_IF
            // Eager because BOTH x_ and y_ must be eagerly evaluated
            // before EAGER_IF will select one of them. If both x_ and y_
            // are cheap (e.g. constant values) then this may also be the
            // simplest and cheapest way to select one of them. If either
            // x_ or y_ is expensive consider using the conditional form
            // of OP_SKIP to carefully avoid it instead.
            case 1 {
                let location_ := sub(stackTopLocation_, 0x60)
                stackTopLocation_ := add(location_, 0x20)
                switch mload(location_)
                // false => use second value
                case 0 {
                    mstore(location_, mload(add(location_, 0x40)))
                }
                // true => use first value
                default {
                    mstore(location_, mload(stackTopLocation_))
                }
            }
            // EQUAL_TO
            case 2 {
                let location_ := sub(stackTopLocation_, 0x40)
                stackTopLocation_ := add(location_, 0x20)
                mstore(
                    location_,
                    eq(mload(location_), mload(stackTopLocation_))
                )
            }
            // LESS_THAN
            case 3 {
                let location_ := sub(stackTopLocation_, 0x40)
                stackTopLocation_ := add(location_, 0x20)
                mstore(
                    location_,
                    lt(mload(location_), mload(stackTopLocation_))
                )
            }
            // GREATER_THAN
            case 4 {
                let location_ := sub(stackTopLocation_, 0x40)
                stackTopLocation_ := add(location_, 0x20)
                mstore(
                    location_,
                    gt(mload(location_), mload(stackTopLocation_))
                )
            }
            // EVERY
            // EVERY is either the first item if every item is nonzero, else 0.
            // operand_ is the length of items to check.
            case 5 {
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
            // ANY
            // ANY is the first nonzero item, else 0.
            // operand_ id the length of items to check.
            case 6 {
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
        }
        return stackTopLocation_;
    }
}
