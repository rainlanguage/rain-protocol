// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/integrity/LibIntegrityState.sol";
import "../../debug/LibDebug.sol";
import "../../type/LibCast.sol";

/// @title LibIntegrityStateTest
/// Test wrapper around `LibIntegrityState` library for testing.
contract LibIntegrityStateTest {
    using LibIntegrityState for IntegrityState;
    using LibCast for uint256[];

    function integrityFunctionPointers(uint256[] memory is_)
        internal
        pure
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return is_.asIntegrityPointers();
    }

    function syncStackMaxTop(
        bytes[] memory sources_,
        StorageOpcodesRange memory storageOpcodesRange_,
        uint256 constantsLength_,
        uint256 stackMaxTop_,
        uint256[] memory integrityPointers_,
        StackTop stackTop_
    ) external returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            storageOpcodesRange_, // storageOpcodesRange
            constantsLength_, // constantsLength
            0, // contextLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            0, // scratch
            integrityFunctionPointers(integrityPointers_) // integrityFunctionPointers
        );
        LibDebug.dumpMemory();
        integrityState_.syncStackMaxTop(stackTop_);
        LibDebug.dumpMemory();
        return integrityState_.stackMaxTop;
    }

    function ensureIntegrity(
        bytes[] memory sources_,
        StorageOpcodesRange memory storageOpcodesRange_,
        uint256 constantsLength_,
        uint256[] memory integrityPointers_,
        SourceIndex sourceIndex_,
        StackTop stackTop_,
        uint256 minimumFinalStackIndex_
    ) external returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            storageOpcodesRange_, // storageOpcodesRange
            constantsLength_, // constantsLength
            0, // contextLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(0), // stackMaxTop
            0, // scratch
            integrityFunctionPointers(integrityPointers_) // integrityFunctionPointers
        );
        LibDebug.dumpMemory();
        integrityState_.ensureIntegrity(
            sourceIndex_,
            stackTop_,
            minimumFinalStackIndex_
        );
        LibDebug.dumpMemory();
        return stackTop_;
    }
}
