// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./LibVMState.sol";
import "./RainVM.sol";
import "../integrity/RainVMIntegrity.sol";
import "../ops/AllStandardOps.sol";

contract StandardVM is RainVM {
    using LibVMState for bytes;
    address internal immutable self;
    address internal immutable vmIntegrity;

    /// Address of the immutable rain script deployed as a `VMState`.
    address internal vmStatePointer;

    constructor(address vmIntegrity_) {
        self = address(this);
        vmIntegrity = vmIntegrity_;
    }

    function _saveVMState(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal virtual {
        bytes memory stateBytes_ = buildStateBytes(
            IRainVMIntegrity(vmIntegrity),
            config_,
            finalMinStacks_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function _loadVMState(uint256[] memory context_)
        internal
        view
        virtual
        returns (VMState memory)
    {
        return SSTORE2.read(vmStatePointer).fromBytesPacked(context_);
    }

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
        returns (function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[] memory)
    {
        return AllStandardOps.opFunctionPointers(localEvalFunctionPointers());
    }
}
