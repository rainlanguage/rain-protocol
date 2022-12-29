// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../interpreter/run/LibStackPointer.sol";
import "../interpreter/run/LibInterpreterState.sol";
import "../interpreter/deploy/LibIntegrityCheck.sol";

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
    /// @param u_ The integer to cast to an opcode function pointer.
    /// @return fn_ The opcode function pointer.
    function asOpFunctionPointer(
        uint256 u_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer) fn_
        )
    {
        assembly ("memory-safe") {
            fn_ := u_
        }
    }

    /// Retype an array of integers to an array of opcode function pointers.
    /// @param us_ The array of integers to cast to an array of opcode fuction
    /// pointers.
    /// @return fns_ The array of opcode function pointers.
    function asOpcodeFunctionPointers(
        uint256[] memory us_
    )
        internal
        pure
        returns (
            function(InterpreterState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory fns_
        )
    {
        assembly ("memory-safe") {
            fns_ := us_
        }
    }

    /// Retype an integer to an integrity function pointer.
    /// @param u_ The integer to cast to an integrity function pointer.
    /// @return fn_ The integrity function pointer.
    function asIntegrityFunctionPointer(
        uint256 u_
    )
        internal
        pure
        returns (
            function(IntegrityCheckState memory, Operand, StackPointer)
                internal
                view
                returns (StackPointer) fn_
        )
    {
        assembly ("memory-safe") {
            fn_ := u_
        }
    }

    /// Retype a list of integrity check function pointers to a `uint256[]`.
    /// @param fns_ The list of function pointers.
    /// @return us_ The list of pointers as `uint256[]`.
    function asUint256Array(
        function(IntegrityCheckState memory, Operand, StackPointer)
            internal
            view
            returns (StackPointer)[]
            memory fns_
    ) internal pure returns (uint256[] memory us_) {
        assembly ("memory-safe") {
            us_ := fns_
        }
    }

    /// Retype a list of interpreter opcode function pointers to a `uint256[]`.
    /// @param fns_ The list of function pointers.
    /// @return us_ The list of pointers as `uint256[]`.
    function asUint256Array(
        function(InterpreterState memory, Operand, StackPointer)
            view
            returns (StackPointer)[]
            memory fns_
    ) internal pure returns (uint256[] memory us_) {
        assembly ("memory-safe") {
            us_ := fns_
        }
    }

    /// Retype a list of `uint256[]` to `address[]`.
    /// @param us_ The list of integers to cast to addresses.
    /// @return addresses_ The list of addresses cast from each integer.
    function asAddresses(
        uint256[] memory us_
    ) internal pure returns (address[] memory addresses_) {
        assembly ("memory-safe") {
            addresses_ := us_
        }
    }

    /// Retype a list of integers to integrity check function pointers.
    /// @param us_ The list of integers to use as function pointers.
    /// @return fns_ The list of integrity check function pointers.
    function asIntegrityPointers(
        uint256[] memory us_
    )
        internal
        pure
        returns (
            function(IntegrityCheckState memory, Operand, StackPointer)
                view
                returns (StackPointer)[]
                memory fns_
        )
    {
        assembly ("memory-safe") {
            fns_ := us_
        }
    }
}
