// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../FlowCommon.sol";
import "../libraries/LibFlow.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

struct FlowConfig {
    StateConfig stateConfig;
    FlowCommonConfig flowConfig;
}

contract Flow is ReentrancyGuard, FlowCommon {
    using LibInterpreterState for InterpreterState;

    event Initialize(address sender, FlowConfig config);

    /// @param config_ allowed flows set at initialization.
    function initialize(FlowConfig calldata config_) external initializer {
        __FlowCommon_init(config_.flowConfig, MIN_FLOW_SENTINELS);
        emit Initialize(msg.sender, config_);
    }

    function _previewFlow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal view returns (FlowTransfer memory) {
        (StackTop stackBottom_, StackTop stackTop_) = flowStack(
            flow_,
            id_,
            signedContexts_
        );
        return LibFlow.stackToFlow(stackBottom_, stackTop_);
    }

    function previewFlow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowTransfer memory) {
        return _previewFlow(flow_, id_, signedContexts_);
    }

    function flow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external payable virtual nonReentrant returns (FlowTransfer memory) {
        FlowTransfer memory flowTransfer_ = _previewFlow(
            flow_,
            id_,
            signedContexts_
        );
        registerFlowTime(_flowContextReads[flow_], flow_, id_);
        return LibFlow.flow(flowTransfer_, address(this), payable(msg.sender));
    }
}
