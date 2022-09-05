// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./FlowInterpreter.sol";
import "./libraries/LibFlow.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(0);

contract Flow is ReentrancyGuard, FlowInterpreter {
    event Initialize(address sender, StateConfig config);

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address interpreterIntegrity_) FlowInterpreter(interpreterIntegrity_) {}

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(StateConfig calldata config_) external initializer {
        __FlowInterpreter_init(config_);
        emit Initialize(msg.sender, config_);
    }

    function _previewFlow(
        InterpreterState memory state_,
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
        flowIO_ = _previewFlow(_loadInterpreterState(), flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        nonReentrant
        returns (FlowIO memory flowIO_)
    {
        InterpreterState memory state_ = _loadInterpreterState();
        flowIO_ = _previewFlow(state_, flow_, id_);
        _registerFlowTime(flow_, id_);
        LibFlow.flow(flowIO_, address(this), payable(msg.sender));
    }
}
