// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";
import "../../../math/SaturatingMath.sol";

/// @dev Opcode for addition.
uint256 constant OPCODE_ADD = 0;
/// @dev Opcode for saturating addition.
uint256 constant OPCODE_SATURATING_ADD = 1;
/// @dev Opcode for subtraction.
uint256 constant OPCODE_SUB = 2;
/// @dev Opcode for saturating subtraction.
uint256 constant OPCODE_SATURATING_SUB = 3;
/// @dev Opcode for multiplication.
uint256 constant OPCODE_MUL = 4;
/// @dev Opcode for saturating multiplication.
uint256 constant OPCODE_SATURATING_MUL = 5;
/// @dev Opcode for division.
uint256 constant OPCODE_DIV = 6;
/// @dev Opcode for modulo.
uint256 constant OPCODE_MOD = 7;
/// @dev Opcode for exponentiation.
uint256 constant OPCODE_EXP = 8;
/// @dev Opcode for minimum.
uint256 constant OPCODE_MIN = 9;
/// @dev Opcode for maximum.
uint256 constant OPCODE_MAX = 10;
/// @dev Number of provided opcodes for `MathOps`.
uint256 constant MATH_OPS_LENGTH = 11;

/// @title MathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
/// SaturatingMath opcodes are provided as "core" math because the VM has no
/// ability to lazily execute code, which means that overflows cannot be
/// guarded with conditional logic. Saturation is a quick and dirty solution to
/// overflow that is valid in many situations.
library MathOps {
    using SaturatingMath for uint256;

    function stackIndexDiff(uint256, uint256 operand_)
        internal
        pure
        returns (int256)
    {
        // Zero length math ops not supported.
        require(operand_ > 0, "BAD_OPERAND");
        // All operations take operand_ as length inputs and have 1 output.
        return 1 - int256(operand_);
    }

    function applyOp(
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal pure returns (uint256) {
        uint256 location_;
        uint256 accumulator_;
        assembly {
            location_ := sub(stackTopLocation_, mul(operand_, 0x20))
            accumulator_ := mload(location_)
        }
        uint256 intermediate_;
        uint256 didOverflow_ = 0;

        // Addition.
        if (opcode_ == OPCODE_ADD) {
            assembly {
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    intermediate_ := add(accumulator_, mload(cursor_))
                    // Adapted from Open Zeppelin safe math.
                    if lt(intermediate_, accumulator_) {
                        didOverflow_ := 1
                        cursor_ := stackTopLocation_
                    }
                    accumulator_ := intermediate_
                }
            }
        }
        // // Saturating addition.
        // else if (opcode_ == OPCODE_SATURATING_ADD) {
        //     while (cursor_ < top_) {
        //         unchecked {
        //             cursor_++;
        //             accumulator_ = accumulator_.saturatingAdd(
        //                 state_.stack[cursor_]
        //             );
        //         }
        //     }
        // }
        // Subtraction.
        else if (opcode_ == OPCODE_SUB) {
            assembly {
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    intermediate_ := sub(accumulator_, mload(cursor_))
                    // Adapted from Open Zeppelin safe math.
                    if gt(intermediate_, accumulator_) {
                        didOverflow_ := 1
                        cursor_ := stackTopLocation_
                    }
                    accumulator_ := intermediate_
                }
            }
        }
        // Saturating subtraction.
        else if (opcode_ == OPCODE_SATURATING_SUB) {
            uint256 item_;
            uint256 cursor_ = location_;
            while (cursor_ < stackTopLocation_) {
                assembly {
                    cursor_ := add(cursor_, 0x20)
                    item_ := mload(cursor_)
                }
                accumulator_ = accumulator_.saturatingSub(item_);
            }
        }
        // Multiplication.
        // Slither false positive here complaining about dividing before
        // multiplying but both are mututally exclusive according to `opcode_`.
        else if (opcode_ == OPCODE_MUL) {
            assembly {
                let item_ := 0
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    if gt(accumulator_, 0) {
                        item_ := mload(cursor_)
                        intermediate_ := mul(accumulator_, item_)
                        // Adapted from Open Zeppelin safe math.
                        if iszero(eq(div(intermediate_, accumulator_), item_)) {
                            didOverflow_ := 1
                            cursor_ := stackTopLocation_
                        }
                        accumulator_ := intermediate_
                    }
                }
            }
        }
        // // Saturating multiplication.
        // else if (opcode_ == OPCODE_SATURATING_MUL) {
        //     while (cursor_ < top_) {
        //         unchecked {
        //             cursor_++;
        //             accumulator_ = accumulator_.saturatingMul(
        //                 state_.stack[cursor_]
        //             );
        //         }
        //     }
        // }
        // Division.
        else if (opcode_ == OPCODE_DIV) {
            assembly {
                let item_ := 0
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    item_ := mload(cursor_)
                    // Adapted from Open Zeppelin safe math.
                    if iszero(item_) {
                        didOverflow_ := 1
                        cursor_ := stackTopLocation_
                    }
                    accumulator_ := div(accumulator_, item_)
                }
            }
        }
        // Modulo.
        else if (opcode_ == OPCODE_MOD) {
            assembly {
                let item_ := 0
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    item_ := mload(cursor_)
                    // Adapted from Open Zeppelin safe math.
                    if iszero(item_) {
                        didOverflow_ := 1
                        cursor_ := stackTopLocation_
                    }
                    accumulator_ := mod(accumulator_, item_)
                }
            }
        }
        // Exponentiation.
        else if (opcode_ == OPCODE_EXP) {
            uint256 item_;
            uint256 cursor_ = location_;
            while (cursor_ < stackTopLocation_) {
                assembly {
                    cursor_ := add(cursor_, 0x20)
                    item_ := mload(cursor_)
                }
                accumulator_ = accumulator_**item_;
            }
        }
        // Minimum.
        else if (opcode_ == OPCODE_MIN) {
            assembly {
                let item_ := 0
                for {
                    let cursor_ := add(location_, 0x20)
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    item_ := mload(cursor_)
                    if lt(item_, accumulator_) {
                        accumulator_ := item_
                    }
                }
            }
        }
        // Maximum.
        else if (opcode_ == OPCODE_MAX) {
            assembly {
                let item_ := 0
                for {
                    let cursor_ := location_
                } lt(cursor_, stackTopLocation_) {
                    cursor_ := add(cursor_, 0x20)
                } {
                    item_ := mload(cursor_)
                    if gt(item_, accumulator_) {
                        accumulator_ := item_
                    }
                }
            }
        }

        require(didOverflow_ < 1, "MATH_OVERFLOW");
        assembly {
            mstore(location_, accumulator_)
            stackTopLocation_ := add(location_, 0x20)
        }

        return stackTopLocation_;
    }
}
