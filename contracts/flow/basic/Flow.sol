// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../factory/ICloneableV1.sol";
import "../FlowCommon.sol";
import "../libraries/LibFlow.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

bytes32 constant CALLER_META_HASH = bytes32(
    0xe0c7a85ee4bcbc621b9564b80921a7e24a95999d189c76246079583e285b7524
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
        InterpreterCallerV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        FlowConfig memory config_ = abi.decode(data_, (FlowConfig));
        __FlowCommon_init(config_.config, MIN_FLOW_SENTINELS);
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
