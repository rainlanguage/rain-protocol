// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

/// @title LogicOps
/// @notice RainVM opcode pack to perform some basic logic operations.
library LogicOps {
    /// Number of provided opcodes for `LogicOps`.
    /// The opcodes are NOT listed on the library as they are all internal to
    /// the assembly and yul doesn't seem to support using solidity constants
    /// as switch case values.
    uint256 internal constant OPS_LENGTH = 4;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal pure {
        require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
        assembly {
            let stackIndex_ := mload(state_)
            let stackLocation_ := mload(add(state_, 0x20))
            // y_ is immediately below stackIndex_
            // It is an error to call any logic on an empty stack.
            let y_ := mload(add(stackLocation_, mul(stackIndex_, 0x20)))
            if iszero(opcode_) {
                // Can modify the top value of the stack in place as
                // input and output is size 1.
                mstore(add(stackLocation_, mul(stackIndex_, 0x20)), iszero(y_))
            }
            if iszero(iszero(opcode_)) {
                stackIndex_ := sub(stackIndex_, 1)
                mstore(state_, stackIndex_)
                let x_ := mload(add(stackLocation_, mul(stackIndex_, 0x20)))
                let output_ := 0

                switch opcode_
                // EQUAL_TO
                case 1 {
                    output_ := eq(x_, y_)
                }
                // LESS_THAN
                case 2 {
                    output_ := lt(x_, y_)
                }
                // GREATER_THAN
                case 3 {
                    output_ := gt(x_, y_)
                }

                mstore(add(stackLocation_, mul(stackIndex_, 0x20)), output_)
            }
        }
    }
}
