// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../interpreter/deploy/LibIntegrityState.sol";
import "../../../../debug/LibDebug.sol";
import "../../../../type/LibCast.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";

/// @title LibIntegrityStateTest
/// Test wrapper around `LibIntegrityState` library for testing.
contract LibIntegrityStateTest {
    using LibIntegrityState for IntegrityState;
    using LibCast for uint256[];

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory localFnPtrs_ = new function(
                IntegrityState memory,
                Operand,
                StackTop
            ) view returns (StackTop)[](0);
        return AllStandardOps.integrityFunctionPointers(localFnPtrs_);
    }

    function syncStackMaxTop(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackMaxTop_,
        StackTop stackTop_
    ) external returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        LibDebug.dumpMemory();
        integrityState_.syncStackMaxTop(stackTop_);
        LibDebug.dumpMemory();
        return integrityState_.stackMaxTop;
    }

    function ensureIntegrityTest(
        bytes[] memory sources_,
        uint256 constantsLength_,
        SourceIndex sourceIndex_,
        StackTop stackTop_,
        uint minStackOutputs_
    ) external returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(0), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        LibDebug.dumpMemory();
        integrityState_.ensureIntegrity(
            sourceIndex_,
            stackTop_,
            minStackOutputs_
        );
        LibDebug.dumpMemory();
        return stackTop_;
    }

    function push(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackMaxTop_,
        StackTop stackTop_
    ) external view returns (StackTop stackTopAfter_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        stackTopAfter_ = integrityState_.push(stackTop_);
    }

    function push(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackMaxTop_,
        StackTop stackTop_,
        uint256 n_
    ) external view returns (StackTop stackTopAfter_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(0), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        stackTopAfter_ = integrityState_.push(stackTop_, n_);
    }

    function popUnderflowCheck(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackBottom_,
        uint256 stackMaxTop_,
        StackTop stackTop_
    ) external view {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(stackBottom_), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        integrityState_.popUnderflowCheck(stackTop_);
    }

    function pop(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackBottom_,
        uint256 stackMaxTop_,
        StackTop stackTop_
    ) external view returns (StackTop stackTopAfter_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(stackBottom_), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        stackTopAfter_ = integrityState_.pop(stackTop_);
    }

    function pop(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256 stackBottom_,
        uint256 stackMaxTop_,
        StackTop stackTop_,
        uint256 n_
    ) external view returns (StackTop stackTopAfter_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_, // sources
            constantsLength_, // constantsLength
            StackTop.wrap(stackBottom_), // stackBottom
            StackTop.wrap(stackMaxTop_), // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        stackTopAfter_ = integrityState_.pop(stackTop_, n_);
    }

    function _fn0(uint256) internal pure returns (uint256) {
        return 0;
    }

    function _fn1(Operand, uint256) internal pure returns (uint256) {
        return 0;
    }

    function _fn2(uint256, uint256) internal pure returns (uint256) {
        return 0;
    }

    function _fn3(Operand, uint256, uint256) internal pure returns (uint256) {
        return 0;
    }

    function _fn4(uint256, uint256, uint256) internal pure returns (uint256) {
        return 0;
    }

    function _fn5(uint256[] memory) internal pure returns (uint256) {
        return 0;
    }

    function _fn6(
        uint256,
        uint256,
        uint256[] memory
    ) internal pure returns (uint256) {
        return 0;
    }

    function _fn7(
        uint256,
        uint256,
        uint256,
        uint256[] memory
    ) internal pure returns (uint256) {
        return 0;
    }

    function _fn8(
        uint256,
        uint256[] memory,
        uint256[] memory
    ) internal pure returns (uint256[] memory) {
        return new uint256[](3); // arbitrary length
    }

    // function(uint256, uint256) internal view returns (uint256)
    function applyFnN(
        StackTop stackTop_,
        uint256 n_
    ) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFnN(stackTop_, _fn2, n_);
    }

    // function(uint256) internal view returns (uint256)
    function applyFn0(StackTop stackTop_) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn0);
    }

    // function(Operand, uint256) internal view returns (uint256)
    function applyFn1(StackTop stackTop_) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn1);
    }

    // function(uint256, uint256) internal view returns (uint256)
    function applyFn2(StackTop stackTop_) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn2);
    }

    // function(Operand, uint256, uint256) internal view returns (uint256)
    function applyFn3(StackTop stackTop_) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn3);
    }

    // function(uint256, uint256, uint256) internal view returns (uint256)
    function applyFn4(StackTop stackTop_) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn4);
    }

    // function(uint256[] memory) internal view returns (uint256)
    function applyFn5(
        StackTop stackTop_,
        uint256 length_
    ) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn5, length_);
    }

    // function(uint256, uint256, uint256[] memory) internal view returns (uint256)
    function applyFn6(
        StackTop stackTop_,
        uint256 length_
    ) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn6, length_);
    }

    // function(uint256, uint256, uint256, uint256[] memory) internal view returns (uint256)
    function applyFn7(
        StackTop stackTop_,
        uint256 length_
    ) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn7, length_);
    }

    // function(uint256, uint256[] memory, uint256[] memory) internal view returns (uint256[] memory)
    function applyFn8(
        StackTop stackTop_,
        uint256 length_
    ) external view returns (StackTop) {
        IntegrityState memory integrityState_ = IntegrityState(
            new bytes[](0), // sources
            0, // constantsLength
            StackTop.wrap(0), // stackBottom
            stackTop_, // stackMaxTop
            integrityFunctionPointers() // integrityFunctionPointers
        );
        return integrityState_.applyFn(stackTop_, _fn8, length_);
    }
}
