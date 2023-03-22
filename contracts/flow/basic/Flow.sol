// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import "../../factory/ICloneableV1.sol";
import "../FlowCommon.sol";
import "../libraries/LibFlow.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

bytes32 constant CALLER_META_HASH = bytes32(
    0x9d5630ebe10389bd4e63e702739f19c298bf228a80ccb45f27d83401e9d07ef7
);

struct FlowConfig {
    // https://github.com/ethereum/solidity/issues/13597
    EvaluableConfig dummyConfig;
    EvaluableConfig[] config;
}

contract Flow is ICloneableV1, ReentrancyGuard, FlowCommon {
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256[];

    event Initialize(address sender, FlowConfig config);

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        FlowConfig memory config_ = abi.decode(data_, (FlowConfig));
        flowCommonInit(config_.config, MIN_FLOW_SENTINELS);
        emit Initialize(msg.sender, config_);
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
            new uint256[][](0),
            callerContext_,
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
    ) external payable virtual nonReentrant {
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContexts_
        );
        emit Context(msg.sender, context_);
        (
            FlowTransfer memory flowTransfer_,
            uint256[] memory kvs_
        ) = _previewFlow(evaluable_, context_);
        LibFlow.flow(flowTransfer_, evaluable_.store, kvs_);
    }
}
