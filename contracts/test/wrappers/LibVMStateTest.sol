// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibVMState.sol";
import "../../vm/runtime/LibStackTop.sol";
import "../../vm/ops/AllStandardOps.sol";

/// @title LibVMStateTest
/// Test wrapper around `LibVMState` library.
contract LibVMStateTest is RainVM {
    using LibVMState for VMState;
    using LibVMState for bytes;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainVM
    function opFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return AllStandardOps.opFunctionPointers(localEvalFunctionPointers());
    }

    function debug(
        uint256 stackIndex_,
        DebugStyle debugStyle_,
        bytes[] memory sources_
    ) external view returns (StackTop stackTopAfter_) {
        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            sources_ // ptrSources
        );

        stackTopAfter_ = state_.debug(
            state_.stackBottom.up(stackIndex_),
            debugStyle_
        );
    }

    function fromBytesPacked(bytes[] memory ptrSources_)
        external
        pure
        returns (VMState memory state_)
    {
        uint256[] memory context_ = new uint256[](5);
        bytes memory bytesPacked_ = toBytesPacked(ptrSources_);
        state_ = bytesPacked_.fromBytesPacked(context_);
    }

    function toBytesPacked(bytes[] memory ptrSources_)
        public
        pure
        returns (bytes memory bytesPacked_)
    {
        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            ptrSources_ // ptrSources
        );

        bytesPacked_ = state_.toBytesPacked();
    }

    function eval(bytes[] memory sources_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        bytes[] memory ptrSources_ = new bytes[](sources_.length);
        for (uint256 i_ = 0; i_ < sources_.length; i_++) {
            ptrSources_[i_] = ptrSource(opFunctionPointers(), sources_[i_]);
        }

        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            ptrSources_ // ptrSources
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval();
    }

    function eval(bytes[] memory sources_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        bytes[] memory ptrSources_ = new bytes[](sources_.length);
        for (uint256 i_ = 0; i_ < sources_.length; i_++) {
            ptrSources_[i_] = ptrSource(opFunctionPointers(), sources_[i_]);
        }

        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            ptrSources_ // ptrSources
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_);
    }

    function evalStackTop(bytes[] memory sources_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        bytes[] memory ptrSources_ = new bytes[](sources_.length);
        for (uint256 i_ = 0; i_ < sources_.length; i_++) {
            ptrSources_[i_] = ptrSource(opFunctionPointers(), sources_[i_]);
        }

        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            ptrSources_ // ptrSources
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(state_.stackBottom); // just use normal stackBottom for testing
    }

    function evalStackTop(bytes[] memory sources_, SourceIndex sourceIndex_)
        external
        view
        returns (StackTop stackTopAfter_, uint256 stackBottom_)
    {
        bytes[] memory ptrSources_ = new bytes[](sources_.length);
        for (uint256 i_ = 0; i_ < sources_.length; i_++) {
            ptrSources_[i_] = ptrSource(opFunctionPointers(), sources_[i_]);
        }

        VMState memory state_ = VMState(
            (new uint256[](5)).asStackTopUp(), // stackBottom,
            (new uint256[](3)).asStackTopUp(), // constantsBottom,
            new uint256[](0), // context,
            ptrSources_ // ptrSources
        );

        stackBottom_ = StackTop.unwrap(state_.stackBottom);
        stackTopAfter_ = state_.eval(sourceIndex_, state_.stackBottom); // just use normal stackBottom for testing
    }
}
