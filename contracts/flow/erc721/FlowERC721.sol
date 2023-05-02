// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {ERC721Upgradeable as ERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";

import "rain.interface.interpreter/IExpressionDeployerV1.sol";
import "sol.lib.memory/LibUint256Array.sol";
import "sol.lib.memory/LibUint256Matrix.sol";
import "rain.interface.interpreter/LibEncodedDispatch.sol";
import "rain.interface.factory/ICloneableV1.sol";
import "rain.interface.flow/IFlowERC721V3.sol";

import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import "../libraries/LibFlow.sol";
import "../../math/LibFixedPointMath.sol";
import "../FlowCommon.sol";
import "../../sentinel/LibSentinel.sol";

/// Thrown when burner of tokens is not the owner of tokens.
error BurnerNotOwner();

uint256 constant RAIN_FLOW_ERC721_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC721_SENTINEL")) | SENTINEL_HIGH_BITS
);

bytes32 constant CALLER_META_HASH = bytes32(
    0xb45a690d69760662f71ac675f2f411c5462bf6bb0fef4167f48c7cacd99304fb
);

SourceIndex constant HANDLE_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant TOKEN_URI_ENTRYPOINT = SourceIndex.wrap(1);
uint256 constant HANDLE_TRANSFER_MIN_OUTPUTS = 0;
uint256 constant TOKEN_URI_MIN_OUTPUTS = 1;
uint16 constant HANDLE_TRANSFER_MAX_OUTPUTS = 0;
uint16 constant TOKEN_URI_MAX_OUTPUTS = 1;

/// @title FlowERC721
contract FlowERC721 is
    ICloneableV1,
    IFlowERC721V3,
    ReentrancyGuard,
    FlowCommon,
    ERC721
{
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibUint256Matrix for uint256[];
    using LibInterpreterState for InterpreterState;
    using LibFixedPointMath for uint256;

    bool private evalHandleTransfer;
    bool private evalTokenURI;
    Evaluable internal evaluable;
    string private baseURI;

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        FlowERC721Config memory config_ = abi.decode(data_, (FlowERC721Config));
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC721_init(config_.name, config_.symbol);
        baseURI = config_.baseURI;
        flowCommonInit(config_.flowConfig, MIN_FLOW_SENTINELS + 2);

        if (config_.evaluableConfig.sources.length > 0) {
            evalHandleTransfer =
                config_
                    .evaluableConfig
                    .sources[SourceIndex.unwrap(HANDLE_TRANSFER_ENTRYPOINT)]
                    .length >
                0;
            evalTokenURI =
                config_.evaluableConfig.sources.length > 1 &&
                config_
                    .evaluableConfig
                    .sources[SourceIndex.unwrap(TOKEN_URI_ENTRYPOINT)]
                    .length >
                0;

            (
                IInterpreterV1 interpreter_,
                IInterpreterStoreV1 store_,
                address expression_
            ) = config_.evaluableConfig.deployer.deployExpression(
                    config_.evaluableConfig.sources,
                    config_.evaluableConfig.constants,
                    LibUint256Array.arrayFrom(
                        HANDLE_TRANSFER_MIN_OUTPUTS,
                        TOKEN_URI_MIN_OUTPUTS
                    )
                );
            evaluable = Evaluable(interpreter_, store_, expression_);
        }
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function tokenURI(
        uint256 tokenId_
    ) public view virtual override returns (string memory) {
        if (evalTokenURI) {
            Evaluable memory evaluable_ = evaluable;
            (uint256[] memory stack_, ) = evaluable_.interpreter.eval(
                evaluable_.store,
                DEFAULT_STATE_NAMESPACE,
                _dispatchTokenURI(evaluable_.expression),
                LibContext.build(
                    LibUint256Array.arrayFrom(tokenId_).matrixFrom(),
                    new SignedContextV1[](0)
                )
            );
            tokenId_ = stack_[0];
        }

        return super.tokenURI(tokenId_);
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

    function _dispatchTokenURI(
        address expression_
    ) internal pure returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression_,
                TOKEN_URI_ENTRYPOINT,
                TOKEN_URI_MAX_OUTPUTS
            );
    }

    /// Needed here to fix Open Zeppelin implementing `supportsInterface` on
    /// multiple base contracts.
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721, ERC1155Receiver) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ERC721
    function _afterTokenTransfer(
        address from_,
        address to_,
        uint256 tokenId_,
        uint256 batchSize_
    ) internal virtual override {
        unchecked {
            super._afterTokenTransfer(from_, to_, tokenId_, batchSize_);

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
                        // Transfer information.
                        // Does NOT include `batchSize_` because handle
                        // transfer is NOT called for mints.
                        LibUint256Array
                            .arrayFrom(
                                uint256(uint160(from_)),
                                uint256(uint160(to_)),
                                tokenId_
                            )
                            .matrixFrom(),
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
    ) internal view returns (FlowERC721IOV1 memory, uint256[] memory) {
        uint256[] memory refs_;
        FlowERC721IOV1 memory flowIO_;
        (
            StackPointer stackBottom_,
            StackPointer stackTop_,
            uint256[] memory kvs_
        ) = flowStack(evaluable_, context_);
        // mints
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC721_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(flowIO_, refs_)
        }
        // burns
        (stackTop_, refs_) = stackTop_.consumeStructs(
            stackBottom_,
            RAIN_FLOW_ERC721_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(add(flowIO_, 0x20), refs_)
        }
        flowIO_.flow = LibFlow.stackToFlow(stackBottom_, stackTop_);
        return (flowIO_, kvs_);
    }

    function _flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC721IOV1 memory) {
        unchecked {
            uint256[][] memory context_ = LibContext.build(
                callerContext_.matrixFrom(),
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                FlowERC721IOV1 memory flowIO_,
                uint256[] memory kvs_
            ) = _previewFlow(evaluable_, context_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                _safeMint(flowIO_.mints[i_].account, flowIO_.mints[i_].id);
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                uint256 burnId_ = flowIO_.burns[i_].id;
                if (ERC721.ownerOf(burnId_) != flowIO_.burns[i_].account) {
                    revert BurnerNotOwner();
                }
                _burn(burnId_);
            }
            LibFlow.flow(flowIO_.flow, evaluable_.store, kvs_);
            return flowIO_;
        }
    }

    function previewFlow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) external view virtual returns (FlowERC721IOV1 memory) {
        uint256[][] memory context_ = LibContext.build(
            callerContext_.matrixFrom(),
            signedContexts_
        );
        (FlowERC721IOV1 memory flowERC721IO_, ) = _previewFlow(
            evaluable_,
            context_
        );
        return flowERC721IO_;
    }

    function flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) external virtual returns (FlowERC721IOV1 memory) {
        return _flow(evaluable_, callerContext_, signedContexts_);
    }
}
