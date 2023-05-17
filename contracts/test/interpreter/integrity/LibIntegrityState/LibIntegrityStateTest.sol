// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "../../../../interpreter/deploy/LibIntegrityCheck.sol";
import "../../../../debug/LibDebug.sol";
import "../../../../interpreter/ops/AllStandardOps.sol";

import "hardhat/console.sol";

/// @title LibIntegrityCheckTest
/// Test wrapper around `LibIntegrityCheck` library.
contract LibIntegrityCheckTest {
    using LibIntegrityCheck for IntegrityCheckState;

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityCheckState memory, Operand, Pointer)
                view
                returns (Pointer)[]
                memory
        )
    {
        return AllStandardOps.integrityFunctionPointers();
    }

    function syncStackMaxTop(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackMaxTop_,
        Pointer stackTop_
    ) external returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackMaxTop = stackMaxTop_;
        LibDebug.dumpMemory();
        integrityCheckState_.syncStackMaxTop(stackTop_);
        LibDebug.dumpMemory();
        return integrityCheckState_.stackMaxTop;
    }

    function ensureIntegrityTest(
        bytes[] memory sources_,
        uint256[] memory constants_,
        SourceIndex sourceIndex_,
        Pointer stackTop_,
        uint256 minStackOutputs_
    ) external returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        LibDebug.dumpMemory();
        integrityCheckState_.ensureIntegrity(
            sourceIndex_,
            stackTop_,
            minStackOutputs_
        );
        LibDebug.dumpMemory();
        return stackTop_;
    }

    function ensureIntegrityTest(
        bytes[] memory sources_,
        uint256[] memory constants_,
        SourceIndex sourceIndex_,
        Pointer stackTop_,
        uint256 minStackOutputs_,
        uint256 stackBottom_
    ) external returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        LibDebug.dumpMemory();
        integrityCheckState_.stackBottom = Pointer.wrap(stackBottom_);
        integrityCheckState_.ensureIntegrity(
            sourceIndex_,
            stackTop_,
            minStackOutputs_
        );
        LibDebug.dumpMemory();
        return stackTop_;
    }

    function push(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackMaxTop_,
        Pointer stackTop_
    ) external view returns (Pointer stackTopAfter_, uint256 newStackMaxTop) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackMaxTop = stackMaxTop_;

        stackTopAfter_ = integrityCheckState_.push(stackTop_);
        newStackMaxTop = Pointer.unwrap(integrityCheckState_.stackMaxTop);
    }

    function push(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackMaxTop_,
        Pointer stackTop_,
        uint256 n_
    ) external view returns (Pointer stackTopAfter_, uint256 newStackMaxTop) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackMaxTop = stackMaxTop_;

        stackTopAfter_ = integrityCheckState_.push(stackTop_, n_);
        newStackMaxTop = Pointer.unwrap(integrityCheckState_.stackMaxTop);
    }

    function pushIgnoreHighwater(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackMaxTop_,
        Pointer stackTop_
    ) external view returns (Pointer stackTopAfter_, uint256 newStackMaxTop) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackMaxTop = stackMaxTop_;

        stackTopAfter_ = integrityCheckState_.push(stackTop_);
        newStackMaxTop = Pointer.unwrap(integrityCheckState_.stackMaxTop);
    }

    function popUnderflowCheck(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackBottom_,
        Pointer stackHighwater_,
        Pointer stackMaxTop_,
        Pointer stackTop_
    ) external view {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackBottom = stackBottom_;
        integrityCheckState_.stackHighwater = stackHighwater_;
        integrityCheckState_.stackMaxTop = stackMaxTop_;

        integrityCheckState_.popUnderflowCheck(stackTop_);
    }

    function pop(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackBottom_,
        Pointer stackHighwater_,
        Pointer stackMaxTop_,
        Pointer stackTop_
    ) external view returns (Pointer stackTopAfter_) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackBottom = stackBottom_;
        integrityCheckState_.stackHighwater = stackHighwater_;
        integrityCheckState_.stackMaxTop = stackMaxTop_;
        stackTopAfter_ = integrityCheckState_.pop(stackTop_);
    }

    function pop(
        bytes[] memory sources_,
        uint256[] memory constants_,
        Pointer stackBottom_,
        Pointer stackHighwater_,
        Pointer stackMaxTop_,
        Pointer stackTop_,
        uint256 n_
    ) external view returns (Pointer stackTopAfter_) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(sources_, constants_, integrityFunctionPointers());
        integrityCheckState_.stackBottom = stackBottom_;
        integrityCheckState_.stackHighwater = stackHighwater_;
        integrityCheckState_.stackMaxTop = stackMaxTop_;
        stackTopAfter_ = integrityCheckState_.pop(stackTop_, n_);
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
        Pointer stackTop_,
        uint256 n_
    ) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFnN(stackTop_, _fn2, n_);
    }

    // function(uint256) internal view returns (uint256)
    function applyFn0(Pointer stackTop_) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn0);
    }

    // function(Operand, uint256) internal view returns (uint256)
    function applyFn1(Pointer stackTop_) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn1);
    }

    // function(uint256, uint256) internal view returns (uint256)
    function applyFn2(Pointer stackTop_) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn2);
    }

    // function(Operand, uint256, uint256) internal view returns (uint256)
    function applyFn3(Pointer stackTop_) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn3);
    }

    // function(uint256, uint256, uint256) internal view returns (uint256)
    function applyFn4(Pointer stackTop_) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn4);
    }

    // function(uint256[] memory) internal view returns (uint256)
    function applyFn5(
        Pointer stackTop_,
        uint256 length_
    ) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn5, length_);
    }

    // function(uint256, uint256, uint256[] memory) internal view returns (uint256)
    function applyFn6(
        Pointer stackTop_,
        uint256 length_
    ) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn6, length_);
    }

    // function(uint256, uint256, uint256, uint256[] memory) internal view returns (uint256)
    function applyFn7(
        Pointer stackTop_,
        uint256 length_
    ) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn7, length_);
    }

    // function(uint256, uint256[] memory, uint256[] memory) internal view returns (uint256[] memory)
    function applyFn8(
        Pointer stackTop_,
        uint256 length_
    ) external view returns (Pointer) {
        IntegrityCheckState memory integrityCheckState_ = LibIntegrityCheck
            .newState(
                new bytes[](0),
                new uint256[](0),
                integrityFunctionPointers()
            );
        integrityCheckState_.stackMaxTop = stackTop_;
        return integrityCheckState_.applyFn(stackTop_, _fn8, length_);
    }
}
