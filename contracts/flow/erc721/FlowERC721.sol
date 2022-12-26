// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import {ERC721Upgradeable as ERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/LibFlow.sol";
import "../../math/FixedPointMath.sol";
import "../FlowCommon.sol";
import "../../sentinel/LibSentinel.sol";
import {ERC1155ReceiverUpgradeable as ERC1155Receiver} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";

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
    StateConfig stateConfig;
    FlowCommonConfig flowConfig;
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

SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant CAN_TRANSFER_MIN_OUTPUTS = 1;
uint256 constant CAN_TRANSFER_MAX_OUTPUTS = 1;

/// @title FlowERC721
contract FlowERC721 is ReentrancyGuard, FlowCommon, ERC721 {
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibInterpreterState for InterpreterState;
    using FixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC721Config config);

    EncodedDispatch internal _dispatch;

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(
        FlowERC721Config calldata config_
    ) external initializer {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC721_init(config_.name, config_.symbol);
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
        super._afterTokenTransfer(from_, to_, tokenId_, batchSize_);
        // Mint and burn access MUST be handled by CAN_FLOW.
        // CAN_TRANSFER will only restrict subsequent transfers.
        if (!(from_ == address(0) || to_ == address(0))) {
            uint256[] memory callerContext_ = LibUint256Array.arrayFrom(
                uint256(uint160(from_)),
                uint256(uint160(to_)),
                tokenId_,
                batchSize_
            );
            EncodedDispatch dispatch_ = _dispatch;
            (uint[] memory stack_, uint[] memory stateChanges_) = _interpreter
                .eval(
                    dispatch_,
                    LibContext.build(
                        new uint[][](0),
                        callerContext_,
                        new SignedContext[](0)
                    )
                );
            require(
                stack_.asStackPointerAfter().peek() > 0,
                "INVALID_TRANSFER"
            );
            if (stateChanges_.length > 0) {
                _interpreter.stateChanges(stateChanges_);
            }
        }
    }

    function _previewFlow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) internal view returns (FlowERC721IO memory, uint[] memory) {
        uint256[] memory refs_;
        FlowERC721IO memory flowIO_;
        (
            StackPointer stackBottom_,
            StackPointer stackTop_,
            uint[] memory stateChanges_
        ) = flowStack(dispatch_, callerContext_, signedContexts_);
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
        return (flowIO_, stateChanges_);
    }

    function _flow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) internal virtual nonReentrant returns (FlowERC721IO memory) {
        unchecked {
            (
                FlowERC721IO memory flowIO_,
                uint[] memory stateChanges_
            ) = _previewFlow(dispatch_, callerContext_, signedContexts_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                _safeMint(flowIO_.mints[i_].account, flowIO_.mints[i_].id);
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                uint256 burnId_ = flowIO_.burns[i_].id;
                require(
                    ERC721.ownerOf(burnId_) == flowIO_.burns[i_].account,
                    "NOT_OWNER"
                );
                _burn(burnId_);
            }
            LibFlow.flow(flowIO_.flow, _interpreter, stateChanges_);
            return flowIO_;
        }
    }

    function previewFlow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external view virtual returns (FlowERC721IO memory) {
        (FlowERC721IO memory flowERC721IO_, ) = _previewFlow(
            dispatch_,
            callerContext_,
            signedContexts_
        );
        return flowERC721IO_;
    }

    function flow(
        EncodedDispatch dispatch_,
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external payable virtual returns (FlowERC721IO memory) {
        return _flow(dispatch_, callerContext_, signedContexts_);
    }
}
