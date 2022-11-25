// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../FlowCommon.sol";
import "../libraries/LibFlow.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

struct FlowConfig {
    StateConfig stateConfig;
    FlowCommonConfig flowConfig;
}

contract Flow is ReentrancyGuard, FlowCommon {
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint[];

    event Initialize(address sender, FlowConfig config);

    /// @param config_ allowed flows set at initialization.
    function initialize(FlowConfig calldata config_) external initializer {
        __FlowCommon_init(config_.flowConfig, MIN_FLOW_SENTINELS);
        emit Initialize(msg.sender, config_);
    }

    function _previewFlow(
        EncodedDispatch dispatch_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal view returns (FlowTransfer memory, uint[] memory) {
        (
            StackTop stackBottom_,
            StackTop stackTop_,
            uint[] memory stateChanges_
        ) = flowStack(dispatch_, id_, signedContexts_);
        return (LibFlow.stackToFlow(stackBottom_, stackTop_), stateChanges_);
    }

    function previewFlow(
        EncodedDispatch dispatch_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowTransfer memory) {
        (FlowTransfer memory flowTransfer_, ) = _previewFlow(
            dispatch_,
            id_,
            signedContexts_
        );
        return flowTransfer_;
    }

    function flow(
        EncodedDispatch dispatch_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external payable virtual nonReentrant {
        (
            FlowTransfer memory flowTransfer_,
            uint[] memory stateChanges_
        ) = _previewFlow(dispatch_, id_, signedContexts_);
        LibFlow.flow(flowTransfer_, _interpreter, stateChanges_);
    }
}
