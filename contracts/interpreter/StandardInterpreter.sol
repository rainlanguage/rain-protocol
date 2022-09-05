// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./LibInterpreter.sol";
import "./integrity/StandardInterpreterIntegrity.sol";
import "./ops/AllStandardOps.sol";
import "../sstore2/SSTORE2.sol";

uint256 constant DEFAULT_MIN_FINAL_STACK = 1;

contract StandardInterpreter {
    using LibInterpreter for bytes;
    using LibUint256Array for uint256;

    address internal immutable self;
    address internal immutable interpreterIntegrity;

    /// Address of the immutable rain script deployed as a `InterpreterState`.
    address internal vmStatePointer;

    constructor(address interpreterIntegrity_) {
        self = address(this);
        interpreterIntegrity = interpreterIntegrity_;
    }

    function _saveInterpreterState(StateConfig memory config_) internal {
        return _saveInterpreterState(config_, DEFAULT_MIN_FINAL_STACK);
    }

    function _saveInterpreterState(StateConfig memory config_, uint256 finalMinStack_)
        internal
    {
        return _saveInterpreterState(config_, finalMinStack_.arrayFrom());
    }

    function _saveInterpreterState(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal virtual {
        bytes memory stateBytes_ = LibInterpreter.buildStateBytes(
            IInterpreterIntegrity(interpreterIntegrity),
            opcodeFunctionPointers(),
            config_,
            finalMinStacks_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function _loadInterpreterState() internal view returns (InterpreterState memory) {
        return _loadInterpreterState(vmStatePointer);
    }

    function _loadInterpreterState(address vmStatePointer_) internal view returns (InterpreterState memory) {
        return _loadInterpreterState(vmStatePointer_, new uint[][](0));
    }

    function _loadInterpreterState(address vmStatePointer_, uint256[][] memory context_)
        internal
        view
        virtual
        returns (InterpreterState memory)
    {
        return SSTORE2.read(vmStatePointer_).deserialize(context_);
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// Expose all the function pointers for every opcode as 2-byte pointers in
    /// a bytes list. The implementing VM MUST ensure each pointer is to a
    /// `function(uint256,uint256) view returns (uint256)` function as this is
    /// the ONLY supported signature for opcodes. Pointers for the core opcodes
    /// must be provided in the packed pointers list but will be ignored at
    /// runtime.
    function opcodeFunctionPointers()
        internal
        view
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }
}
