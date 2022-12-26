// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../run/LibStackPointer.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "../run/IInterpreterV1.sol";

/// Running an integrity check is a stateful operation. As well as the basic
/// configuration of what is being checked such as the sources and size of the
/// constants, the current and maximum stack height is being recomputed on every
/// checked opcode.
/// @param sources All the sources of the expression are provided to the
/// integrity check as any entrypoint and non-entrypoint can `call` into some
/// other source at any time, provided the overall inputs and outputs to the
/// stack are valid.
/// @param constantsLength The integrity check assumes the existence of some
/// opcode that will read from a predefined list of constants. Technically this
/// opcode MAY NOT exist in some interpreter but it seems highly likely to be
/// included in most setups. The integrity check only needs the length of the
/// constants array to check for out of bounds reads, which allows runtime
/// behaviour to read without additional gas for OOB index checks.
/// @param stackBottom The
struct IntegrityCheckState {
    // Sources in zeroth position as we read from it in assembly without paying
    // gas to calculate offsets.
    bytes[] sources;
    uint256 constantsLength;
    StackPointer stackBottom;
    StackPointer stackMaxTop;
    function(IntegrityCheckState memory, Operand, StackPointer)
        view
        returns (StackPointer)[] integrityFunctionPointers;
}

library LibIntegrityCheck {
    using LibIntegrityCheck for IntegrityCheckState;
    using LibStackPointer for StackPointer;
    using Math for uint256;

    function syncStackMaxTop(
        IntegrityCheckState memory integrityCheckState_,
        StackPointer stackTop_
    ) internal pure {
        if (
            StackPointer.unwrap(stackTop_) >
            StackPointer.unwrap(integrityCheckState_.stackMaxTop)
        ) {
            integrityCheckState_.stackMaxTop = stackTop_;
        }
    }

    function ensureIntegrity(
        IntegrityCheckState memory integrityState_,
        SourceIndex sourceIndex_,
        StackPointer stackTop_,
        uint minStackOutputs_
    ) internal view returns (StackPointer) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            assembly ("memory-safe") {
                cursor_ := mload(
                    add(
                        mload(integrityState_),
                        add(0x20, mul(0x20, sourceIndex_))
                    )
                )
                end_ := add(cursor_, mload(cursor_))
            }

            // Loop until complete.
            while (cursor_ < end_) {
                uint256 opcode_;
                Operand operand_;
                cursor_ += 4;
                assembly ("memory-safe") {
                    let op_ := mload(cursor_)
                    operand_ := and(op_, 0xFFFF)
                    opcode_ := and(shr(16, op_), 0xFFFF)
                }
                // We index into the function pointers here to ensure that any
                // opcodes that we don't have a pointer for will error.
                stackTop_ = integrityState_.integrityFunctionPointers[opcode_](
                    integrityState_,
                    operand_,
                    stackTop_
                );
            }
            require(
                minStackOutputs_ <=
                    integrityState_.stackBottom.toIndex(stackTop_),
                "MIN_FINAL_STACK"
            );
            return stackTop_;
        }
    }

    function push(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer stackTopAfter_) {
        stackTopAfter_ = stackTop_.up();
        integrityState_.syncStackMaxTop(stackTopAfter_);
    }

    function push(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        uint256 n_
    ) internal pure returns (StackPointer stackTopAfter_) {
        stackTopAfter_ = stackTop_.up(n_);
        integrityState_.syncStackMaxTop(stackTopAfter_);
    }

    function popUnderflowCheck(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_
    ) internal pure {
        require(
            // Stack bottom may be non-zero so check we are above it.
            (StackPointer.unwrap(stackTop_) >=
                StackPointer.unwrap(integrityState_.stackBottom)) &&
                // If we underflowed zero then we will be above the stack max
                // top. Assumes that at least 1 item was popped so we can do a
                // strict inequality check here.
                (StackPointer.unwrap(stackTop_) <
                    StackPointer.unwrap(integrityState_.stackMaxTop)),
            "STACK_UNDERFLOW"
        );
    }

    function pop(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_
    ) internal pure returns (StackPointer stackTopAfter_) {
        stackTopAfter_ = stackTop_.down();
        integrityState_.popUnderflowCheck(stackTopAfter_);
    }

    function pop(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        uint256 n_
    ) internal pure returns (StackPointer) {
        if (n_ > 0) {
            stackTop_ = stackTop_.down(n_);
            integrityState_.popUnderflowCheck(stackTop_);
        }
        return stackTop_;
    }

    function applyFnN(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256) internal view returns (uint256),
        uint256 n_
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, n_));
    }

    function applyFnN(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256) internal view,
        uint256 n_
    ) internal pure returns (StackPointer) {
        return integrityState_.pop(stackTop_, n_);
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256) internal view returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(Operand, uint256) internal view returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256) internal view
    ) internal pure returns (StackPointer) {
        return integrityState_.pop(stackTop_, 2);
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(Operand, uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, 3));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256, uint256, uint)
            internal
            view
            returns (uint256)
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, 4));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256[] memory) internal view returns (uint256),
        uint256 length_
    ) internal pure returns (StackPointer) {
        return integrityState_.push(integrityState_.pop(stackTop_, length_));
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256),
        uint256 length_
    ) internal pure returns (StackPointer) {
        unchecked {
            return
                integrityState_.push(
                    integrityState_.pop(stackTop_, length_ + 2)
                );
        }
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256),
        uint256 length_
    ) internal pure returns (StackPointer) {
        unchecked {
            return
                integrityState_.push(
                    integrityState_.pop(stackTop_, length_ + 3)
                );
        }
    }

    function applyFn(
        IntegrityCheckState memory integrityState_,
        StackPointer stackTop_,
        function(uint256, uint256[] memory, uint256[] memory)
            internal
            view
            returns (uint256[] memory),
        uint256 length_
    ) internal pure returns (StackPointer) {
        unchecked {
            return
                integrityState_.push(
                    integrityState_.pop(stackTop_, length_ * 2 + 1),
                    length_
                );
        }
    }
}
