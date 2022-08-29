// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./FlowVM.sol";
import "./libraries/LibFlow.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(0);

contract Flow is ReentrancyGuard, FlowVM {
    event Initialize(address sender, StateConfig config);

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address vmIntegrity_) FlowVM(vmIntegrity_) {}

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(StateConfig calldata config_) external initializer {
        __FlowVM_init(config_);
        emit Initialize(msg.sender, config_);
    }

    function _previewFlow(
        VMState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (FlowIO memory flowIO_) {
        StackTop stackTop_ = flowStack(state_, CAN_FLOW_ENTRYPOINT, flow_, id_);
        flowIO_ = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowIO memory flowIO_)
    {
        flowIO_ = _previewFlow(_loadVMState(), flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        nonReentrant
        returns (FlowIO memory flowIO_)
    {
        VMState memory state_ = _loadVMState();
        flowIO_ = _previewFlow(state_, flow_, id_);
        registerFlowTime(IdempotentFlag.wrap(state_.scratch), flow_, id_);
        LibFlow.flow(flowIO_, address(this), payable(msg.sender));
    }
}
