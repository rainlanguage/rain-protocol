// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../sentinel/LibSentinel.sol";
import "../libraries/LibFlow.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../FlowCommon.sol";
import {ERC1155Upgradeable as ERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";

/// Thrown when eval of the transfer entrypoint returns 0.
error InvalidTransfer();

uint256 constant RAIN_FLOW_ERC1155_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC1155_SENTINEL")) | SENTINEL_HIGH_BITS
);

struct FlowERC1155Config {
    string uri;
    StateConfig stateConfig;
    FlowCommonConfig flowConfig;
}

struct ERC1155SupplyChange {
    address account;
    uint256 id;
    uint256 amount;
}

struct FlowERC1155IO {
    ERC1155SupplyChange[] mints;
    ERC1155SupplyChange[] burns;
    FlowTransfer flow;
}

SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant CAN_TRANSFER_MIN_OUTPUTS = 1;
uint256 constant CAN_TRANSFER_MAX_OUTPUTS = 1;

uint256 constant FLOW_ERC1155_MIN_OUTPUTS = MIN_FLOW_SENTINELS + 2;

contract FlowERC1155 is ReentrancyGuard, FlowCommon, ERC1155 {
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    event Initialize(address sender, FlowERC1155Config config);

    EncodedDispatch internal _dispatch;

    function initialize(
        FlowERC1155Config calldata config_
    ) external initializer {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC1155_init(config_.uri);
        // Ignoring context scratch here as we never use it, all context is
        // provided unconditionally.
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
        __FlowCommon_init(config_.flowConfig, FLOW_ERC1155_MIN_OUTPUTS);
    }

    /// Needed here to fix Open Zeppelin implementing `supportsInterface` on
    /// multiple base contracts.
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, ERC1155Receiver) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ERC1155
    function _afterTokenTransfer(
        address operator_,
        address from_,
        address to_,
        uint256[] memory ids_,
        uint256[] memory amounts_,
        bytes memory data_
    ) internal virtual override {
        unchecked {
            super._afterTokenTransfer(
                operator_,
                from_,
                to_,
                ids_,
                amounts_,
                data_
            );
            // Mint and burn access MUST be handled by flow.
            // CAN_TRANSFER will only restrict subsequent transfers.
            if (!(from_ == address(0) || to_ == address(0))) {
                EncodedDispatch dispatch_ = _dispatch;

                for (uint256 i_ = 0; i_ < ids_.length; i_++) {
                    uint256[][] memory context_ = LibUint256Array
                        .arrayFrom(
                            uint(uint160(msg.sender)),
                            uint(uint160(operator_)),
                            uint256(uint160(from_)),
                            uint256(uint160(to_)),
                            ids_[i_],
                            amounts_[i_]
                        )
                        .matrixFrom();
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
    }

    function _previewFlow(
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    )
        internal
        view
        returns (FlowERC1155IO memory, IInterpreterStoreV1, uint256[] memory)
    {
        uint256[] memory refs_;
        FlowERC1155IO memory flowIO_;
        (
            StackPointer stackBottom_,
            StackPointer stackTop_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = flowStack(dispatch_, context_);
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mstore(flowIO_, refs_)
        }
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
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
    ) internal virtual nonReentrant returns (FlowERC1155IO memory) {
        unchecked {
            uint256[][] memory context_ = LibContext.build(
                new uint256[][](0),
                callerContext_,
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                FlowERC1155IO memory flowIO_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = _previewFlow(dispatch_, context_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                // @todo support data somehow.
                _mint(
                    flowIO_.mints[i_].account,
                    flowIO_.mints[i_].id,
                    flowIO_.mints[i_].amount,
                    ""
                );
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                _burn(
                    flowIO_.burns[i_].account,
                    flowIO_.burns[i_].id,
                    flowIO_.burns[i_].amount
                );
            }
            LibFlow.flow(flowIO_.flow, store_, kvs_);
            return flowIO_;
        }
    }

    function previewFlow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowERC1155IO memory) {
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContexts_
        );
        (FlowERC1155IO memory flowERC1155IO_, , ) = _previewFlow(
            dispatch_,
            context_
        );
        return flowERC1155IO_;
    }

    function flow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external payable virtual returns (FlowERC1155IO memory) {
        return _flow(dispatch_, callerContext_, signedContexts_);
    }
}
