// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../vm/runtime/StandardVM.sol";
import "./libraries/LibFlow.sol";
import "./FlowIntegrity.sol";
import "../idempotent/LibIdempotentFlag.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract FlowVM is Initializable, StandardVM {
    using LibIdempotentFlag for IdempotentFlag;
    using LibVMState for VMState;
    using LibStackTop for StackTop;

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address vmIntegrity_) StandardVM(vmIntegrity_) {

    }

    /// @param config_ source and token config. Also controls delegated claims.
    function __FlowVM_init(StateConfig calldata config_) internal onlyInitializing {
        _saveVMState(config_);
    }

    function flowStack(
        SourceIndex canFlow_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (VMState memory, StackTop) {
        require(
            SourceIndex.unwrap(flow_) > SourceIndex.unwrap(canFlow_),
            "FLOW_OOB"
        );
        VMState memory state_ = _loadVMState(
            LibUint256Array.arrayFrom(SourceIndex.unwrap(flow_), id_)
        );
        require(
            SourceIndex.unwrap(flow_) < state_.compiledSources.length,
            "FLOW_OOB"
        );
        require(state_.eval(canFlow_).peek() > 0, "CANT_FLOW");
        return (state_, state_.eval(flow_));
    }

    function registerFlowTime(VMState memory state_, SourceIndex flow_, uint id_) internal {
        if (IdempotentFlag.wrap(state_.scratch).get(FLAG_INDEX_FLOW_TIME)) {
            _flows[flow_][id_] = block.timestamp;
        }
    }

    function _flowTime(uint256 flow_, uint256 id_)
        internal
        view
        returns (uint256 flowTime_)
    {
        return _flows[SourceIndex.wrap(flow_)][id_];
    }

    function opFlowTime(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_flowTime);
    }

    function localEvalFunctionPointers()
        internal
        pure
        override
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {
        localFnPtrs_ = new function(VMState memory, Operand, StackTop)
            view
            returns (StackTop)[](LOCAL_OPS_LENGTH);
        localFnPtrs_[0] = opFlowTime;
    }
}
