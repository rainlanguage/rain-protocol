// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../interpreter/run/LibStackTop.sol";
import "../interpreter/run/LibInterpreterState.sol";
import "../interpreter/deploy/LibIntegrityState.sol";
import "../interpreter/run/RainInterpreter.sol";

/// @title LibCast
/// @notice Additional type casting logic that the Solidity compiler doesn't
/// give us by default. A type cast (vs. conversion) is considered one where the
/// structure is unchanged by the cast. The cast does NOT (can't) check that the
/// input is a valid output, for example any integer MAY be cast to a function
/// pointer but almost all integers are NOT valid function pointers. It is the
/// calling context that MUST ensure the validity of the data, the cast will
/// merely retype the data in place, generally without additional checks.
/// As most structures in solidity have the same memory structure as a `uint256`
/// or fixed/dynamic array of `uint256` there are many conversions that can be
/// done with near zero or minimal overhead.
library LibCast {
    /// Retype an integer to an opcode function pointer.
    /// @param i_ The integer to cast to an opcode function pointer.
    /// @return fn_ The opcode function pointer.
    function asOpFunctionPointer(
        uint256 i_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop) fn_
        )
    {
        assembly ("memory-safe") {
            fn_ := i_
        }
    }

    /// Retype an array of integers to an array of opcode function pointers.
    /// @param is_ The array of integers to cast to an array of opcode fuction
    /// pointers.
    /// @return fns_ The array of opcode function pointers.
    function asOpcodeFunctionPointers(
        uint256[] memory is_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory fns_
        )
    {
        assembly ("memory-safe") {
            fns_ := is_
        }
    }

    /// Retype an integer to an integrity function pointer.
    /// @param i_ The integer to cast to an integrity function pointer.
    /// @return fn_ The integrity function pointer.
    function asIntegrityFunctionPointer(
        uint256 i_
    )
        internal
        pure
        returns (
            function(IntegrityState memory, Operand, StackTop)
                internal
                view
                returns (StackTop) fn_
        )
    {
        assembly ("memory-safe") {
            fn_ := i_
        }
    }

    /// Retype an integer to a pointer to the interpreter eval function.
    /// @param i_ The integer to cast to the eval function.
    /// @return fn_ The eval function.
    function asEvalFunctionPointer(
        uint256 i_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, SourceIndex, StackTop)
                view
                returns (StackTop) fn_
        )
    {
        assembly ("memory-safe") {
            fn_ := i_
        }
    }

    /// Retype a stack move function pointer to an integer.
    /// Provided the origin of the function pointer is solidity and NOT yul, the
    /// returned integer will be valid to run if retyped back via yul. If the
    /// origin of the function pointer is yul then we cannot guarantee anything
    /// about the validity beyond the correctness of the yul code in question.
    ///
    /// Function pointers as integers are NOT portable across contracts as the
    /// code in different contracts is different so function pointers will point
    /// to a different, incompatible part of the code.
    ///
    /// Function pointers as integers lose the information about their signature
    /// so MUST ONLY be called in an appropriate context once restored.
    /// @param fn_ The stack move function pointer to integerify.
    /// @return i_ The integer of the function pointer.
    function asUint256(
        function(uint256) view returns (uint256) fn_
    ) internal pure returns (uint256 i_) {
        assembly ("memory-safe") {
            i_ := fn_
        }
    }

    function asUint256(
        function(IntegrityState memory, Operand, StackTop)
            internal
            view
            returns (StackTop) fn_
    ) internal pure returns (uint256 i_) {
        assembly ("memory-safe") {
            i_ := fn_
        }
    }

    function asUint256Array(
        function(IntegrityState memory, Operand, StackTop)
            internal
            view
            returns (StackTop)[]
            memory fns_
    ) internal pure returns (uint256[] memory is_) {
        assembly ("memory-safe") {
            is_ := fns_
        }
    }

    function asUint256(bool bool_) internal pure returns (uint256 i_) {
        assembly ("memory-safe") {
            i_ := bool_
        }
    }

    function asUint256(
        function(InterpreterState memory, SourceIndex, StackTop)
            view
            returns (StackTop) fn_
    ) internal pure returns (uint256 i_) {
        assembly ("memory-safe") {
            i_ := fn_
        }
    }

    function asUint256Array(
        function(InterpreterState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory fns_
    ) internal pure returns (uint256[] memory is_) {
        assembly ("memory-safe") {
            is_ := fns_
        }
    }

    function asUint256Array(
        function(uint256) pure returns (uint256)[] memory fns_
    ) internal pure returns (uint256[] memory is_) {
        assembly ("memory-safe") {
            is_ := fns_
        }
    }

    function asAddresses(
        uint256[] memory is_
    ) internal pure returns (address[] memory addresses_) {
        assembly ("memory-safe") {
            addresses_ := is_
        }
    }

    function asIntegrityPointers(
        uint256[] memory is_
    )
        internal
        pure
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory fns_
        )
    {
        assembly ("memory-safe") {
            fns_ := is_
        }
    }
}
