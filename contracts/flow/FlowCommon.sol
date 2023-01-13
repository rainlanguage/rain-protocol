// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./libraries/LibFlow.sol";
import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/IInterpreterV1.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibContext.sol";
import "../interpreter/run/LibInterpreterState.sol";
import "../interpreter/run/IInterpreterCallerV1.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MulticallUpgradeable as Multicall} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {ERC721HolderUpgradeable as ERC721Holder} from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {ERC1155HolderUpgradeable as ERC1155Holder} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

uint256 constant FLAG_COLUMN_FLOW_ID = 0;
uint256 constant FLAG_ROW_FLOW_ID = 0;
uint256 constant FLAG_COLUMN_FLOW_TIME = 0;
uint256 constant FLAG_ROW_FLOW_TIME = 2;

uint256 constant MIN_FLOW_SENTINELS = 4;

SourceIndex constant FLOW_ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant FLOW_MAX_OUTPUTS = type(uint16).max;

struct FlowCommonConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig[] flows;
}

contract FlowCommon is
    ERC721Holder,
    ERC1155Holder,
    Multicall,
    IInterpreterCallerV1
{
    using LibInterpreterState for InterpreterState;
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    IInterpreterV1 internal _interpreter;

    /// flow expression pointer => is registered
    mapping(EncodedDispatch => uint256) internal _flows;

    event FlowInitialized(
        address sender,
        address interpreter,
        EncodedDispatch dispatch
    );

    constructor() {
        _disableInitializers();
    }

    // solhint-disable-next-line func-name-mixedcase
    function __FlowCommon_init(
        FlowCommonConfig memory config_,
        uint256 flowMinOutputs_
    ) internal onlyInitializing {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Multicall_init();
        require(flowMinOutputs_ >= MIN_FLOW_SENTINELS, "BAD MIN STACKS LENGTH");
        _interpreter = IInterpreterV1(config_.interpreter);
        for (uint256 i_ = 0; i_ < config_.flows.length; i_++) {
            address expression_ = IExpressionDeployerV1(
                config_.expressionDeployer
            ).deployExpression(
                    config_.flows[i_],
                    LibUint256Array.arrayFrom(flowMinOutputs_)
                );
            EncodedDispatch dispatch_ = LibEncodedDispatch.encode(
                expression_,
                FLOW_ENTRYPOINT,
                FLOW_MAX_OUTPUTS
            );
            _flows[dispatch_] = 1;
            emit FlowInitialized(msg.sender, config_.interpreter, dispatch_);
        }
    }

    modifier onlyRegisteredDispatch(EncodedDispatch dispatch_) {
        require(_flows[dispatch_] > 0, "UNREGISTERED_FLOW");
        _;
    }

    function flowStack(
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    )
        internal
        view
        onlyRegisteredDispatch(dispatch_)
        returns (
            StackPointer,
            StackPointer,
            IInterpreterStoreV1,
            uint256[] memory
        )
    {
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = _interpreter.eval(DEFAULT_STATE_NAMESPACE, dispatch_, context_);
        return (
            stack_.asStackPointerUp(),
            stack_.asStackPointerAfter(),
            store_,
            kvs_
        );
    }

    receive() external payable virtual {}
}
