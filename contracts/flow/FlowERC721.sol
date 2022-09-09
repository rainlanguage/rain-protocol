// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {StandardExpressionDeployer, StateConfig} from "../interpreter/deploy/StandardExpressionDeployer.sol";
import "../interpreter/StandardInterpreter.sol";
import {AllStandardOps} from "../interpreter/ops/AllStandardOps.sol";
import {ERC721Upgradeable as ERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./libraries/LibFlow.sol";
import "../math/FixedPointMath.sol";
import "../idempotent/LibIdempotentFlag.sol";
import "../sentinel/LibSentinel.sol";

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
    StateConfig vmStateConfig;
}

struct FlowERC721IO {
    uint256[] mints;
    uint256[] burns;
    FlowIO flow;
}

SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(1);

/// @title FlowERC721
contract FlowERC721 is ReentrancyGuard, ERC721 {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibInterpreter for InterpreterState;
    using FixedPointMath for uint256;
    using LibUint256Array for uint[];

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC721Config config);

    constructor() {
        _disableInitializers();
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC721Config calldata config_)
        external
        initializer
    {
        __ReentrancyGuard_init();
        __ERC721_init(config_.name, config_.symbol);
        _saveInterpreterState(config_.vmStateConfig);
        emit Initialize(msg.sender, config_);
    }

    function _transferPreflight(
        address from_,
        address to_,
        uint256 tokenId_
    ) internal view virtual {
        InterpreterState memory state_ = _loadInterpreterState();
        state_.context = LibUint256Array.arrayFrom(
            uint256(uint160(from_)),
            uint256(uint160(to_)),
            tokenId_
        ).matrixFrom();
        require(
            state_.eval(CAN_TRANSFER_ENTRYPOINT).peek() > 0,
            "INVALID_TRANSFER"
        );
    }

    function _transfer(
        address from_,
        address to_,
        uint256 tokenId_
    ) internal virtual override {
        _transferPreflight(from_, to_, tokenId_);
        return super._transfer(from_, to_, tokenId_);
    }

    function _previewFlow(
        InterpreterState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (FlowERC721IO memory flowIO_) {
        StackTop stackTop_ = flowStack(state_, CAN_FLOW_ENTRYPOINT, flow_, id_);
        (stackTop_, flowIO_.mints) = stackTop_.consumeSentinel(
            state_.stackBottom,
            RAIN_FLOW_ERC721_SENTINEL,
            1
        );
        (stackTop_, flowIO_.burns) = stackTop_.consumeSentinel(
            state_.stackBottom,
            RAIN_FLOW_ERC721_SENTINEL,
            1
        );
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
        return flowIO_;
    }

    function _flow(
        InterpreterState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC721IO memory flowIO_) {
        unchecked {
            flowIO_ = _previewFlow(state_, flow_, id_);
            _registerFlowTime(flow_, id_);
            for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
                _safeMint(msg.sender, flowIO_.mints[i_]);
            }
            for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
                uint256 burnId_ = flowIO_.burns[i_];
                require(ERC721.ownerOf(burnId_) == msg.sender, "NOT_OWNER");
                _burn(burnId_);
            }
            LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
        }
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC721IO memory)
    {
        return _previewFlow(_loadInterpreterState(), flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        returns (FlowERC721IO memory)
    {
        return _flow(_loadInterpreterState(), flow_, id_);
    }
}
