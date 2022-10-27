// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/deploy/IExpressionDeployer.sol";
import "../../interpreter/run/StandardInterpreter.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/LibFlow.sol";
import "../../math/FixedPointMath.sol";
import "../../idempotent/LibIdempotentFlag.sol";
import "../FlowCommon.sol";

uint256 constant RAIN_FLOW_ERC20_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC20_SENTINEL")) | SENTINEL_HIGH_BITS
);

/// Constructor config.
/// @param Constructor config for the ERC20 token minted according to flow
/// schedule in `flow`.
/// @param Constructor config for the `ImmutableSource` that defines the
/// emissions schedule for claiming.
struct FlowERC20Config {
    string name;
    string symbol;
    StateConfig stateConfig;
    FlowCommonConfig flowConfig;
}

struct ERC20SupplyChange {
    address account;
    uint256 amount;
}

struct FlowERC20IO {
    ERC20SupplyChange[] mints;
    ERC20SupplyChange[] burns;
    FlowTransfer flow;
}

SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);

/// @title FlowERC20
/// @notice Mints itself according to some predefined schedule. The schedule is
/// expressed as an expression and the `claim` function is world-callable.
/// Intended behaviour is to avoid sybils infinitely minting by putting the
/// claim functionality behind a `TierV2` contract. The flow contract
/// itself implements `ReadOnlyTier` and every time a claim is processed it
/// logs the block number of the claim against every tier claimed. So the block
/// numbers in the tier report for `FlowERC20` are the last time that tier
/// was claimed against this contract. The simplest way to make use of this
/// information is to take the max block for the underlying tier and the last
/// claim and then diff it against the current block number.
/// See `test/Claim/FlowERC20.sol.ts` for examples, including providing
/// staggered rewards where more tokens are minted for higher tier accounts.
contract FlowERC20 is ReentrancyGuard, FlowCommon, ERC20 {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibInterpreterState for InterpreterState;
    using FixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    address internal _expression;

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config memory config_) external initializer {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        // Ignoring context scratch here as we never use it, all context is
        // provided unconditionally.
        (address expression_, ) = IExpressionDeployer(
            config_.flowConfig.expressionDeployer
        ).deployExpression(config_.stateConfig, LibUint256Array.arrayFrom(1));
        _expression = expression_;
        __FlowCommon_init(config_.flowConfig);
    }

    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(from_, to_, amount_);
        // Mint and burn access MUST be handled by CAN_FLOW.
        // CAN_TRANSFER will only restrict subsequent transfers.
        if (!(from_ == address(0) || to_ == address(0))) {
            uint256[][] memory context_ = LibUint256Array
                .arrayFrom(
                    uint256(uint160(from_)),
                    uint256(uint160(to_)),
                    amount_
                )
                .matrixFrom();
            require(
                _interpreter
                    .eval(_expression, CAN_TRANSFER_ENTRYPOINT, context_)
                    .asStackTopAfter()
                    .peek() > 0,
                "INVALID_TRANSFER"
            );
        }
    }

    function _previewFlow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal view virtual returns (FlowERC20IO memory) {
        uint256[] memory refs_;
        FlowERC20IO memory flowIO_;
        (StackTop stackBottom_, StackTop stackTop_) = flowStack(
            flow_,
            id_,
            signedContexts_
        );
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC20_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(flowIO_, refs_)
        }
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC20_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(add(flowIO_, 0x20), refs_)
        }
        flowIO_.flow = LibFlow.stackToFlow(stackBottom_, stackTop_);

        return flowIO_;
    }

    function _flow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC20IO memory) {
        FlowERC20IO memory flowIO_ = _previewFlow(flow_, id_, signedContexts_);
        registerFlowTime(_flowContextScratches[flow_], flow_, id_);
        for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
            _mint(flowIO_.mints[i_].account, flowIO_.mints[i_].amount);
        }
        for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
            _burn(flowIO_.burns[i_].account, flowIO_.burns[i_].amount);
        }
        LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
        return flowIO_;
    }

    function previewFlow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowERC20IO memory) {
        return _previewFlow(flow_, id_, signedContexts_);
    }

    function flow(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) external payable virtual returns (FlowERC20IO memory) {
        return _flow(flow_, id_, signedContexts_);
    }
}
