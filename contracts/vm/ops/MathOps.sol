// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

/// @title MathOps
/// @notice RainVM opcode pack to perform basic checked math operations.
/// Underflow and overflow will error as per default solidity behaviour.
library MathOps {
    /// Opcode for addition.
    uint256 private constant ADD = 0;
    /// Opcode for subtraction.
    uint256 private constant SUB = 1;
    /// Opcode for multiplication.
    uint256 private constant MUL = 2;
    /// Opcode for division.
    uint256 private constant DIV = 3;
    /// Opcode for modulo.
    uint256 private constant MOD = 4;
    /// Opcode for exponentiation.
    uint256 private constant EXP = 5;
    /// Opcode for minimum.
    uint256 private constant MIN = 6;
    /// Opcode for maximum.
    uint256 private constant MAX = 7;
    /// Number of provided opcodes for `MathOps`.
    uint256 internal constant OPS_LENGTH = 8;

    function applyOp(
        bytes memory,
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
        if (opcode_ == ADD) {
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
        // Subtraction.
        else if (opcode_ == SUB) {
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
        // Multiplication.
        // Slither false positive here complaining about dividing before
        // multiplying but both are mututally exclusive according to `opcode_`.
        else if (opcode_ == MUL) {
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
        // Division.
        else if (opcode_ == DIV) {
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
        else if (opcode_ == MOD) {
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
        else if (opcode_ == EXP) {
            uint256 item_;
            uint256 cursor_ = location_;
            while (cursor_ < stackTopLocation_) {
                assembly {
                    item_ := mload(cursor_)
                    cursor_ := add(cursor_, 0x20)
                }
                accumulator_**item_;
            }
        }
        // Minimum.
        else if (opcode_ == MIN) {
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
        else if (opcode_ == MAX) {
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
