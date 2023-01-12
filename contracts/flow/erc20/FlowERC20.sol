// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/LibFlow.sol";
import "../../math/FixedPointMath.sol";
import "../FlowCommon.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";

/// Thrown when eval of the transfer entrypoint returns 0.
error InvalidTransfer();

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
uint256 constant CAN_TRANSFER_MIN_OUTPUTS = 1;
uint256 constant CAN_TRANSFER_MAX_OUTPUTS = 1;

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
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibInterpreterState for InterpreterState;
    using FixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    EncodedDispatch internal _dispatch;

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config memory config_) external initializer {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        address expression_ = IExpressionDeployerV1(
            config_.flowConfig.expressionDeployer
        ).deployExpression(
                config_.stateConfig,
                LibUint256Array.arrayFrom(CAN_TRANSFER_MIN_OUTPUTS)
            );
        _dispatch = LibEncodedDispatch.encode(
            expression_,
            CAN_TRANSFER_ENTRYPOINT,
            CAN_TRANSFER_MAX_OUTPUTS
        );
        __FlowCommon_init(config_.flowConfig, MIN_FLOW_SENTINELS + 2);
    }

    /// @inheritdoc ERC20
    function _afterTokenTransfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal virtual override {
        unchecked {
            super._afterTokenTransfer(from_, to_, amount_);
            // Mint and burn access MUST be handled by flow.
            // CAN_TRANSFER will only restrict subsequent transfers.
            if (!(from_ == address(0) || to_ == address(0))) {
                uint256[][] memory context_ = LibUint256Array
                    .arrayFrom(
                        uint(uint160(msg.sender)),
                        uint256(uint160(from_)),
                        uint256(uint160(to_)),
                        amount_
                    )
                    .matrixFrom();
                EncodedDispatch dispatch_ = _dispatch;
                (
                    uint256[] memory stack_,
                    IInterpreterStoreV1 store_,
                    uint256[] memory kvs_
                ) = _interpreter.eval(
                        DEFAULT_STATE_NAMESPACE,
                        dispatch_,
                        context_
                    );
                if (stack_[stack_.length - 1] == 0) {
                    revert InvalidTransfer();
                }
                if (kvs_.length > 0) {
                    store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
                }
            }
        }
    }

    function _previewFlow(
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    )
        internal
        view
        virtual
        returns (FlowERC20IO memory, IInterpreterStoreV1, uint256[] memory)
    {
        uint256[] memory refs_;
        FlowERC20IO memory flowIO_;
        (
            StackPointer stackBottom_,
            StackPointer stackTop_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = flowStack(dispatch_, context_);
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

        return (flowIO_, store_, kvs_);
    }

    function _flow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC20IO memory) {
        unchecked {
            uint256[][] memory context_ = LibContext.build(
                new uint256[][](0),
                callerContext_,
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                FlowERC20IO memory flowIO_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = _previewFlow(dispatch_, context_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                _mint(flowIO_.mints[i_].account, flowIO_.mints[i_].amount);
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                _burn(flowIO_.burns[i_].account, flowIO_.burns[i_].amount);
            }
            LibFlow.flow(flowIO_.flow, store_, kvs_);
            return flowIO_;
        }
    }

    function previewFlow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowERC20IO memory) {
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContexts_
        );
        (FlowERC20IO memory flowERC20IO_, , ) = _previewFlow(
            dispatch_,
            context_
        );
        return flowERC20IO_;
    }

    function flow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external payable virtual returns (FlowERC20IO memory) {
        return _flow(dispatch_, callerContext_, signedContexts_);
    }
}
