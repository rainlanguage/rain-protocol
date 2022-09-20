// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../vm/runtime/StandardVM.sol";
import "./libraries/LibFlow.sol";
import "./FlowIntegrity.sol";
import "../idempotent/LibIdempotentFlag.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC1155HolderUpgradeable as ERC1155Holder} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "hardhat/console.sol";

contract FlowVM is ERC1155Holder, StandardVM {
    using LibIdempotentFlag for IdempotentFlag;
    using LibVMState for VMState;
    using LibStackTop for StackTop;

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address vmIntegrity_) StandardVM(vmIntegrity_) {}

    /// @param config_ source and token config. Also controls delegated claims.
    // solhint-disable-next-line func-name-mixedcase
    function __FlowVM_init(StateConfig calldata config_)
        internal
        onlyInitializing
    {
        __ERC1155Holder_init();
        _saveVMState(config_);
    }

    function flowStack(
        VMState memory state_,
        SourceIndex canFlow_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (StackTop) {
        require(
            SourceIndex.unwrap(flow_) > SourceIndex.unwrap(canFlow_),
            "FLOW_OOB"
        );
        state_.context = LibUint256Array.arrayFrom(
            SourceIndex.unwrap(flow_),
            id_
        );
        require(
            SourceIndex.unwrap(flow_) < state_.compiledSources.length,
            "FLOW_OOB"
        );
        require(state_.eval(canFlow_).peek() > 0, "CANT_FLOW");

        return state_.eval(flow_);
    }

    function registerFlowTime(
        IdempotentFlag flag_,
        SourceIndex flow_,
        uint256 id_
    ) internal {
        if (flag_.get(FLAG_INDEX_FLOW_TIME)) {
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

    receive() external payable virtual {}
}
