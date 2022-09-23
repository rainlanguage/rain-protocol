// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {RainVMIntegrity, StateConfig} from "../vm/integrity/RainVMIntegrity.sol";
import "../vm/runtime/StandardVM.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./libraries/LibFlow.sol";
import "../math/FixedPointMath.sol";
import "../idempotent/LibIdempotentFlag.sol";
import "./FlowVM.sol";
import "./libraries/LibRebase.sol";

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

struct FlowERC20IO {
    uint256 mint;
    uint256 burn;
    FlowIO flow;
}

uint constant CORE_SOURCE_ID = 0;

SourceIndex constant REBASE_RATIO_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(1);

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
    using LibRebase for VMState;
    using LibRebase for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    constructor(address vmIntegrity_) FlowVM(vmIntegrity_) {
        _disableInitializers();
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config calldata config_) external initializer {
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        _saveVMState(CORE_SOURCE_ID, config_.vmStateConfig);
        __FlowVM_init(config_.flows, LibUint256Array.arrayFrom(1, 10));
        emit Initialize(msg.sender, config_);
    }

    function totalSupply() public view virtual override returns (uint256) {
        return
            super.totalSupply().rebaseOutput(
                _loadVMState(CORE_SOURCE_ID).rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            );
    }

    function balanceOf(address account_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return
            super.balanceOf(account_).rebaseOutput(
                _loadVMState(CORE_SOURCE_ID).rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            );
    }

    function _transferPreflight(
        address from_,
        address to_,
        uint256 amount_
    ) internal view virtual returns (uint256 amountRebased_) {
        VMState memory state_ = _loadVMState(CORE_SOURCE_ID);
        amountRebased_ = amount_.rebaseInput(
            state_.rebaseRatio(REBASE_RATIO_ENTRYPOINT)
        );
        state_.context = LibUint256Array.arrayFrom(
            uint256(uint160(from_)),
            uint256(uint160(to_)),
            amount_,
            amountRebased_
        );
        require(
            state_.eval(CAN_TRANSFER_ENTRYPOINT).peek() > 0,
            "INVALID_TRANSFER"
        );
    }

    /// @inheritdoc ERC20
    function _transfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal virtual override {
        return
            super._transfer(
                from_,
                to_,
                _transferPreflight(msg.sender, to_, amount_)
            );
    }

    /// @inheritdoc ERC20
    function allowance(address owner_, address spender_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return
            super.allowance(owner_, spender_).rebaseOutput(
                _loadVMState(CORE_SOURCE_ID).rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            );
    }

    /// @inheritdoc ERC20
    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal virtual override {
        super._approve(
            owner_,
            spender_,
            amount_.rebaseInput(
                _loadVMState(CORE_SOURCE_ID).rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            )
        );
    }

    function _previewFlow(
        VMState memory state_,
        uint256 id_
    ) internal view virtual returns (FlowERC20IO memory) {
        FlowERC20IO memory flowIO_;
        StackTop stackTop_ = flowStack(state_, id_);
        (stackTop_, flowIO_.mint) = stackTop_.pop();
        (stackTop_, flowIO_.burn) = stackTop_.pop();
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
        uint256 rebaseRatio_ = state_.rebaseRatio(REBASE_RATIO_ENTRYPOINT);
        flowIO_.mint = flowIO_.mint.rebaseInput(rebaseRatio_);
        flowIO_.burn = flowIO_.burn.rebaseInput(rebaseRatio_);
        return flowIO_;
    }

    function _flow(
        VMState memory state_,
        uint flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC20IO memory) {
        FlowERC20IO memory flowIO_ = _previewFlow(state_, id_);
        registerFlowTime(IdempotentFlag.wrap(state_.scratch), flow_, id_);
        _mint(msg.sender, flowIO_.mint);
        _burn(msg.sender, flowIO_.burn);
        LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
        return flowIO_;
    }

    function previewFlow(uint flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC20IO memory)
    {
        return _previewFlow(_loadVMState(flow_), id_);
    }

    function flow(uint flow_, uint256 id_)
        external
        virtual
        nonReentrant
        returns (FlowERC20IO memory)
    {
        return _flow(_loadVMState(flow_), flow_, id_);
    }
}
