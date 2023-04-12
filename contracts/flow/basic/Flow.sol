// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import "rain.interface.factory/ICloneableV1.sol";
import "../FlowCommon.sol";
import "../libraries/LibFlow.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "sol.lib.memory/LibUint256Matrix.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

bytes32 constant CALLER_META_HASH = bytes32(
    0x8c6deed2783f554b1b2c80bb68d3df076b07f9c7664c27fd22318fee137c216f
);

contract Flow is ICloneableV1, IFlowV1, ReentrancyGuard, FlowCommon {
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256[];
    using LibUint256Matrix for uint256[];

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        FlowConfig memory config_ = abi.decode(data_, (FlowConfig));
        emit Initialize(msg.sender, config_);

        flowCommonInit(config_.config, MIN_FLOW_SENTINELS);
    }

    function _previewFlow(
        Evaluable memory evaluable_,
        uint256[][] memory context_
    ) internal view returns (FlowTransfer memory, uint256[] memory) {
        (
            StackPointer stackBottom_,
            StackPointer stackTop_,
            uint256[] memory kvs_
        ) = flowStack(evaluable_, context_);
        return (LibFlow.stackToFlow(stackBottom_, stackTop_), kvs_);
    }

    function previewFlow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowTransfer memory) {
        uint256[][] memory context_ = LibContext.build(
            callerContext_.matrixFrom(),
            signedContexts_
        );
        (FlowTransfer memory flowTransfer_, ) = _previewFlow(
            evaluable_,
            context_
        );
        return flowTransfer_;
    }

    function flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external payable virtual nonReentrant returns (FlowTransfer memory) {
        uint256[][] memory context_ = LibContext.build(
            callerContext_.matrixFrom(),
            signedContexts_
        );
        emit Context(msg.sender, context_);
        (
            FlowTransfer memory flowTransfer_,
            uint256[] memory kvs_
        ) = _previewFlow(evaluable_, context_);
        LibFlow.flow(flowTransfer_, evaluable_.store, kvs_);
        return flowTransfer_;
    }
}
