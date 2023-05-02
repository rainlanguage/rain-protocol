// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "./libraries/LibFlow.sol";
import "rain.interface.interpreter/IInterpreterCallerV2.sol";
import "rain.interface.interpreter/IExpressionDeployerV1.sol";
import "rain.interface.interpreter/IInterpreterV1.sol";
import "rain.interface.interpreter/LibEncodedDispatch.sol";
import "rain.interface.interpreter/LibContext.sol";
import "../interpreter/run/LibInterpreterState.sol";
import "../interpreter/deploy/DeployerDiscoverableMetaV1.sol";
import "rain.interface.interpreter/LibEvaluable.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MulticallUpgradeable as Multicall} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {ERC721HolderUpgradeable as ERC721Holder} from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {ERC1155HolderUpgradeable as ERC1155Holder} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

/// Thrown when the flow being evaluated is unregistered.
/// @param unregisteredHash Hash of the unregistered flow.
error UnregisteredFlow(bytes32 unregisteredHash);

/// Thrown when the min outputs for a flow is fewer than the sentinels.
error BadMinStackLength(uint256 flowMinOutputs_);

uint256 constant FLAG_COLUMN_FLOW_ID = 0;
uint256 constant FLAG_ROW_FLOW_ID = 0;
uint256 constant FLAG_COLUMN_FLOW_TIME = 0;
uint256 constant FLAG_ROW_FLOW_TIME = 2;

uint256 constant MIN_FLOW_SENTINELS = 3;

SourceIndex constant FLOW_ENTRYPOINT = SourceIndex.wrap(0);
uint16 constant FLOW_MAX_OUTPUTS = type(uint16).max;

contract FlowCommon is
    ERC721Holder,
    ERC1155Holder,
    Multicall,
    IInterpreterCallerV2,
    DeployerDiscoverableMetaV1
{
    using LibInterpreterState for InterpreterState;
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibEvaluable for Evaluable;

    /// Evaluable hash => is registered
    mapping(bytes32 => uint256) internal registeredFlows;

    event FlowInitialized(address sender, Evaluable evaluable);

    constructor(
        bytes32 metaHash_,
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) DeployerDiscoverableMetaV1(metaHash_, config_) {
        _disableInitializers();
    }

    function flowCommonInit(
        EvaluableConfig[] memory evaluableConfigs_,
        uint256 flowMinOutputs_
    ) internal onlyInitializing {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Multicall_init();
        if (flowMinOutputs_ < MIN_FLOW_SENTINELS) {
            revert BadMinStackLength(flowMinOutputs_);
        }
        EvaluableConfig memory config_;
        Evaluable memory evaluable_;
        for (uint256 i_ = 0; i_ < evaluableConfigs_.length; i_++) {
            config_ = evaluableConfigs_[i_];
            (
                IInterpreterV1 interpreter_,
                IInterpreterStoreV1 store_,
                address expression_
            ) = config_.deployer.deployExpression(
                    config_.sources,
                    config_.constants,
                    LibUint256Array.arrayFrom(flowMinOutputs_)
                );
            evaluable_ = Evaluable(interpreter_, store_, expression_);
            registeredFlows[evaluable_.hash()] = 1;
            emit FlowInitialized(msg.sender, evaluable_);
        }
    }

    function _flowDispatch(
        address expression_
    ) internal pure returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression_,
                FLOW_ENTRYPOINT,
                FLOW_MAX_OUTPUTS
            );
    }

    modifier onlyRegisteredEvaluable(Evaluable memory evaluable_) {
        bytes32 hash_ = evaluable_.hash();
        if (registeredFlows[hash_] == 0) {
            revert UnregisteredFlow(hash_);
        }
        _;
    }

    function flowStack(
        Evaluable memory evaluable_,
        uint256[][] memory context_
    )
        internal
        view
        onlyRegisteredEvaluable(evaluable_)
        returns (StackPointer, StackPointer, uint256[] memory)
    {
        (uint256[] memory stack_, uint256[] memory kvs_) = evaluable_
            .interpreter
            .eval(
                evaluable_.store,
                DEFAULT_STATE_NAMESPACE,
                _flowDispatch(evaluable_.expression),
                context_
            );
        return (stack_.asStackPointerUp(), stack_.asStackPointerAfter(), kvs_);
    }
}
