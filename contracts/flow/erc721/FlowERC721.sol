// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import {ERC721Upgradeable as ERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/LibFlow.sol";
import "../../math/LibFixedPointMath.sol";
import "../FlowCommon.sol";
import "../../sentinel/LibSentinel.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";
import "../../factory/ICloneableV1.sol";

/// Thrown when burner of tokens is not the owner of tokens.
error BurnerNotOwner();

uint256 constant RAIN_FLOW_ERC721_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_ERC721_SENTINEL")) | SENTINEL_HIGH_BITS
);

/// Constructor config.
/// @param Constructor config for the ERC721 token minted according to flow
/// schedule in `flow`.
/// @param Constructor config for the `ImmutableSource` that defines the
/// emissions schedule for claiming.
struct FlowERC721Config {
    string name;
    string symbol;
    string baseURI;
    EvaluableConfig evaluableConfig;
    EvaluableConfig[] flowConfig;
}

struct ERC721SupplyChange {
    address account;
    uint256 id;
}

struct FlowERC721IO {
    ERC721SupplyChange[] mints;
    ERC721SupplyChange[] burns;
    FlowTransfer flow;
}

bytes32 constant CALLER_META_HASH = bytes32(
    0x0c4f7aeb3fda98368b1a829b8f3e7cb1d0428f8317ba17a4c8c6a308a79a8291
);

SourceIndex constant HANDLE_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant TOKEN_URI_ENTRYPOINT = SourceIndex.wrap(1);
uint256 constant HANDLE_TRANSFER_MIN_OUTPUTS = 0;
uint256 constant TOKEN_URI_MIN_OUTPUTS = 1;
uint256 constant HANDLE_TRANSFER_MAX_OUTPUTS = 0;
uint256 constant TOKEN_URI_MAX_OUTPUTS = 1;

/// @title FlowERC721
contract FlowERC721 is ICloneableV1, ReentrancyGuard, FlowCommon, ERC721 {
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibInterpreterState for InterpreterState;
    using LibFixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC721Config config);

    bool private evalHandleTransfer;
    bool private evalTokenURI;
    Evaluable internal evaluable;
    string private baseURI;

    constructor(
        InterpreterCallerV1ConstructionConfig memory config_
    ) FlowCommon(CALLER_META_HASH, config_) {}

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        FlowERC721Config memory config_ = abi.decode(data_, (FlowERC721Config));
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC721_init(config_.name, config_.symbol);
        baseURI = config_.baseURI;
        __FlowCommon_init(config_.flowConfig, MIN_FLOW_SENTINELS + 2);

        if (config_.evaluableConfig.sources.length > 0) {
            evalHandleTransfer = config_.evaluableConfig.sources[0].length > 0;
            evalTokenURI =
                config_.evaluableConfig.sources.length > 1 &&
                config_.evaluableConfig.sources[1].length > 0;

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
                    new uint256[][](0),
                    LibUint256Array.arrayFrom(tokenId_),
                    new SignedContext[](0)
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

            if (evalHandleTransfer) {
                // Mint and burn access MUST be handled by CAN_FLOW.
                // CAN_TRANSFER will only restrict subsequent transfers.
                if (!(from_ == address(0) || to_ == address(0))) {
                    Evaluable memory evaluable_ = evaluable;
                    (, uint256[] memory kvs_) = evaluable_.interpreter.eval(
                        evaluable_.store,
                        DEFAULT_STATE_NAMESPACE,
                        _dispatchHandleTransfer(evaluable_.expression),
                        LibContext.build(
                            new uint256[][](0),
                            // Transfer params are caller context.
                            LibUint256Array.arrayFrom(
                                uint256(uint160(from_)),
                                uint256(uint160(to_)),
                                tokenId_
                            ),
                            new SignedContext[](0)
                        )
                    );
                    if (kvs_.length > 0) {
                        evaluable_.store.set(DEFAULT_STATE_NAMESPACE, kvs_);
                    }
                }
            }
        }
    }

    function _previewFlow(
        Evaluable memory evaluable_,
        uint256[][] memory context_
    ) internal view returns (FlowERC721IO memory, uint256[] memory) {
        uint256[] memory refs_;
        FlowERC721IO memory flowIO_;
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
        SignedContext[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC721IO memory) {
        unchecked {
            uint256[][] memory context_ = LibContext.build(
                new uint256[][](0),
                callerContext_,
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (FlowERC721IO memory flowIO_, uint256[] memory kvs_) = _previewFlow(
                evaluable_,
                context_
            );
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
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowERC721IO memory) {
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContexts_
        );
        (FlowERC721IO memory flowERC721IO_, ) = _previewFlow(
            evaluable_,
            context_
        );
        return flowERC721IO_;
    }

    function flow(
        Evaluable memory evaluable_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external payable virtual returns (FlowERC721IO memory) {
        return _flow(evaluable_, callerContext_, signedContexts_);
    }
}
