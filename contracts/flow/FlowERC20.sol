// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {StandardExpressionDeployer, StateConfig} from "../interpreter/deploy/StandardExpressionDeployer.sol";
import "../interpreter/StandardInterpreter.sol";
import {AllStandardOps} from "../interpreter/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./libraries/LibFlow.sol";
import "../math/FixedPointMath.sol";
import "../idempotent/LibIdempotentFlag.sol";
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
}

struct FlowERC20IO {
    uint256 mint;
    uint256 burn;
    FlowIO flow;
}

SourceIndex constant REBASE_RATIO_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_TRANSFER_ENTRYPOINT = SourceIndex.wrap(1);
SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(2);

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
contract FlowERC20 is ReentrancyGuard, FlowInterpreter, ERC20 {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibUint256Array for uint[];
    using LibInterpreter for InterpreterState;
    using FixedPointMath for uint256;
    using LibRebase for InterpreterState;
    using LibRebase for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    constructor(address interpreterIntegrity_) FlowInterpreter(interpreterIntegrity_) {
        _disableInitializers();
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config calldata config_) external initializer {
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        _saveInterpreterState(config_.vmStateConfig);
        emit Initialize(msg.sender, config_);
    }

    function totalSupply() public view virtual override returns (uint256) {
        return
            super.totalSupply().rebaseOutput(
                _loadInterpreterState().rebaseRatio(REBASE_RATIO_ENTRYPOINT)
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
                _loadInterpreterState().rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            );
    }

    function _transferPreflight(
        address from_,
        address to_,
        uint256 amount_
    ) internal view virtual returns (uint256 amountRebased_) {
        InterpreterState memory state_ = _loadInterpreterState();
        amountRebased_ = amount_.rebaseInput(
            state_.rebaseRatio(REBASE_RATIO_ENTRYPOINT)
        );
        state_.context = LibUint256Array.arrayFrom(
            uint256(uint160(from_)),
            uint256(uint160(to_)),
            amount_,
            amountRebased_
        ).matrixFrom();
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
                _loadInterpreterState().rebaseRatio(REBASE_RATIO_ENTRYPOINT)
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
                _loadInterpreterState().rebaseRatio(REBASE_RATIO_ENTRYPOINT)
            )
        );
    }

    function _previewFlow(
        InterpreterState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal view virtual returns (FlowERC20IO memory flowIO_) {
        StackTop stackTop_ = flowStack(state_, CAN_FLOW_ENTRYPOINT, flow_, id_);
        (stackTop_, flowIO_.mint) = stackTop_.pop();
        (stackTop_, flowIO_.burn) = stackTop_.pop();
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
        uint256 rebaseRatio_ = state_.rebaseRatio(REBASE_RATIO_ENTRYPOINT);
        flowIO_.mint = flowIO_.mint.rebaseInput(rebaseRatio_);
        flowIO_.burn = flowIO_.burn.rebaseInput(rebaseRatio_);
        return flowIO_;
    }

    function _flow(
        InterpreterState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal virtual nonReentrant returns (FlowERC20IO memory flowIO_) {
        flowIO_ = _previewFlow(state_, flow_, id_);
        _registerFlowTime(flow_, id_);
        _mint(msg.sender, flowIO_.mint);
        _burn(msg.sender, flowIO_.burn);
        LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC20IO memory)
    {
        return _previewFlow(_loadInterpreterState(), flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        nonReentrant
        returns (FlowERC20IO memory)
    {
        return _flow(_loadInterpreterState(), flow_, id_);
    }
}
