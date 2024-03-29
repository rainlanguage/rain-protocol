// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC1155Upgradeable as ERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";

import "rain.interpreter/lib/caller/LibEncodedDispatch.sol";
import "rain.factory/src/interface/ICloneableV2.sol";
import "rain.solmem/lib/LibUint256Matrix.sol";
import "rain.flow/interface/IFlowERC1155V3.sol";

import "rain.solmem/lib/LibStackPointer.sol";
import "../libraries/LibFlow.sol";
import "../FlowCommon.sol";

Sentinel constant RAIN_FLOW_ERC1155_SENTINEL = Sentinel.wrap(
    uint256(keccak256(bytes("RAIN_FLOW_ERC1155_SENTINEL")) | SENTINEL_HIGH_BITS)
);

bytes32 constant CALLER_META_HASH = bytes32(
    0x7ea70f837234357ec1bb5b777e04453ebaf3ca778a98805c4bb20a738d559a21
);

SourceIndex constant HANDLE_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant HANDLE_TRANSFER_MIN_OUTPUTS = 0;
uint16 constant HANDLE_TRANSFER_MAX_OUTPUTS = 0;

uint256 constant FLOW_ERC1155_MIN_OUTPUTS = MIN_FLOW_SENTINELS + 2;

contract FlowERC1155 is
    ICloneableV2,
    IFlowERC1155V3,
    ReentrancyGuard,
    FlowCommon,
    ERC1155
{
    using LibStackPointer for Pointer;
    using LibStackSentinel for Pointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibUint256Matrix for uint256[];

    bool private evalHandleTransfer;
    Evaluable internal evaluable;

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV2
    function initialize(bytes calldata data_) external initializer returns (bytes32) {
        FlowERC1155Config memory config_ = abi.decode(
            data_,
            (FlowERC1155Config)
        );
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC1155_init(config_.uri);

        flowCommonInit(config_.flowConfig, FLOW_ERC1155_MIN_OUTPUTS);

        if (
            config_.evaluableConfig.sources.length > 0 &&
            config_
                .evaluableConfig
                .sources[SourceIndex.unwrap(HANDLE_TRANSFER_ENTRYPOINT)]
                .length >
            0
        ) {
            evalHandleTransfer = true;
            (
                IInterpreterV1 interpreter_,
                IInterpreterStoreV1 store_,
                address expression_
            ) = config_.evaluableConfig.deployer.deployExpression(
                    config_.evaluableConfig.sources,
                    config_.evaluableConfig.constants,
                    LibUint256Array.arrayFrom(HANDLE_TRANSFER_MIN_OUTPUTS)
                );
            evaluable = Evaluable(interpreter_, store_, expression_);
        }

        return ICLONEABLE_V2_SUCCESS;
    }

    function _dispatchHandleTransfer(
        address expression_
    ) internal pure returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression_,
                HANDLE_TRANSFER_ENTRYPOINT,
                HANDLE_TRANSFER_MAX_OUTPUTS
            );
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
            // HANDLE_TRANSFER will only restrict subsequent transfers.
            if (
                evalHandleTransfer &&
                !(from_ == address(0) || to_ == address(0))
            ) {
                Evaluable memory evaluable_ = evaluable;

                (, uint256[] memory kvs_) = evaluable_.interpreter.eval(
                    evaluable_.store,
                    DEFAULT_STATE_NAMESPACE,
                    _dispatchHandleTransfer(evaluable_.expression),
                    LibContext.build(
                        // Transfer params are caller context.
                        LibUint256Matrix.matrixFrom(
                            LibUint256Array.arrayFrom(
                                uint256(uint160(operator_)),
                                uint256(uint160(from_)),
                                uint256(uint160(to_))
                            ),
                            ids_,
                            amounts_
                        ),
                        new SignedContextV1[](0)
                    )
                );
                if (kvs_.length > 0) {
                    evaluable_.store.set(DEFAULT_STATE_NAMESPACE, kvs_);
                }
            }
        }
    }

    function _previewFlow(
        Evaluable memory evaluable_,
        uint256[][] memory context_
    ) internal view returns (FlowERC1155IOV1 memory, uint256[] memory) {
        ERC1155SupplyChange[] memory mints_;
        ERC1155SupplyChange[] memory burns_;
        Pointer tuplesPointer_;
        (
            Pointer stackBottom_,
            Pointer stackTop_,
            uint256[] memory kvs_
        ) = flowStack(evaluable_, context_);
        // mints
        (stackTop_, tuplesPointer_) = stackBottom_.consumeSentinelTuples(
            stackTop_,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mints_ := tuplesPointer_
        }
        // burns
        (stackTop_, tuplesPointer_) = stackBottom_.consumeSentinelTuples(
            stackTop_,
            RAIN_FLOW_ERC1155_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            burns_ := tuplesPointer_
        }
        return (
            FlowERC1155IOV1(
                mints_,
                burns_,
                LibFlow.stackToFlow(stackBottom_, stackTop_)
            ),
            kvs_
        );
    }

    function _flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC1155IOV1 memory) {
        unchecked {
            uint256[][] memory context_ = LibContext.build(
                callerContext_.matrixFrom(),
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                FlowERC1155IOV1 memory flowIO_,
                uint256[] memory kvs_
            ) = _previewFlow(evaluable_, context_);
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
            LibFlow.flow(flowIO_.flow, evaluable_.store, kvs_);
            return flowIO_;
        }
    }

    function previewFlow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) external view virtual returns (FlowERC1155IOV1 memory) {
        uint256[][] memory context_ = LibContext.build(
            callerContext_.matrixFrom(),
            signedContexts_
        );
        (FlowERC1155IOV1 memory flowERC1155IO_, ) = _previewFlow(
            evaluable_,
            context_
        );
        return flowERC1155IO_;
    }

    function flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) external virtual returns (FlowERC1155IOV1 memory) {
        return _flow(evaluable_, callerContext_, signedContexts_);
    }
}
