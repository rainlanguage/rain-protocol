// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {RainVMIntegrity, StateConfig} from "../../vm/integrity/RainVMIntegrity.sol";
import "../../vm/runtime/StandardVM.sol";
import {AllStandardOps} from "../../vm/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/LibFlow.sol";
import "../../math/FixedPointMath.sol";
import "../../idempotent/LibIdempotentFlag.sol";
import "../vm/FlowVM.sol";

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
    StateConfig vmStateConfig;
    StateConfig[] flows;
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
/// expressed as a rainVM script and the `claim` function is world-callable.
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
contract FlowERC20 is ReentrancyGuard, FlowVM, ERC20 {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibVMState for VMState;
    using FixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    constructor(address vmIntegrity_) FlowVM(vmIntegrity_) {
        _disableInitializers();
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config memory config_) external initializer {
        emit Initialize(msg.sender, config_);
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        _saveVMState(CORE_SOURCE_ID, config_.vmStateConfig);
        __FlowVM_init(config_.flows, LibUint256Array.arrayFrom(1, 6));
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
            VMState memory state_ = _loadVMState(CORE_SOURCE_ID);

            state_.context = LibUint256Array.arrayFrom(
                uint256(uint160(from_)),
                uint256(uint160(to_)),
                amount_
            );
            require(
                state_.eval(CAN_TRANSFER_ENTRYPOINT).peek() > 0,
                "INVALID_TRANSFER"
            );
        }
    }

    function _previewFlow(VMState memory state_)
        internal
        view
        virtual
        returns (FlowERC20IO memory)
    {
        uint256[] memory refs_;
        FlowERC20IO memory flowIO_;
        StackTop stackTop_ = flowStack(state_);
        (stackTop_, refs_) = stackTop_.consumeStructs(
            state_.stackBottom,
            RAIN_FLOW_ERC20_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(flowIO_, refs_)
        }
        (stackTop_, refs_) = stackTop_.consumeStructs(
            state_.stackBottom,
            RAIN_FLOW_ERC20_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(add(flowIO_, 0x20), refs_)
        }
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);

        return flowIO_;
    }

    function _flow(
        VMState memory state_,
        uint256 flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC20IO memory) {
        FlowERC20IO memory flowIO_ = _previewFlow(state_);
        registerFlowTime(IdempotentFlag.wrap(state_.scratch), flow_, id_);
        for (uint256 i_ = 0; i_ < flowIO_.mints.length; i_++) {
            _mint(flowIO_.mints[i_].account, flowIO_.mints[i_].amount);
        }
        for (uint256 i_ = 0; i_ < flowIO_.burns.length; i_++) {
            _burn(flowIO_.burns[i_].account, flowIO_.burns[i_].amount);
        }
        LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
        return flowIO_;
    }

    function previewFlow(uint256 flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC20IO memory)
    {
        return _previewFlow(_loadFlowState(flow_, id_));
    }

    function flow(uint256 flow_, uint256 id_)
        external
        payable
        virtual
        returns (FlowERC20IO memory)
    {
        return _flow(_loadFlowState(flow_, id_), flow_, id_);
    }
}
