// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {RainVMIntegrity, StateConfig} from "../vm/integrity/RainVMIntegrity.sol";
import "../vm/runtime/StandardVM.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../array/LibUint256Array.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./libraries/LibFlow.sol";
import "../math/FixedPointMath.sol";
import "../timepoints/Timepoints.sol";

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

SourceIndex constant REBASE_RATIO_ENDPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_TRANSFER_ENDPOINT = SourceIndex.wrap(1);
SourceIndex constant CAN_FLOW_ENDPOINT = SourceIndex.wrap(2);

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
contract FlowERC20 is ReentrancyGuard, StandardVM, ERC20 {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibVMState for VMState;
    using FixedPointMath for uint256;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, FlowERC20Config config);

    /// Each claim is modelled as a report so that the claim report can be
    /// diffed against the upstream report from a tier based emission scheme.
    mapping(uint256 => Timepoint[]) private flowStates;

    constructor(address vmIntegrity_) StandardVM(vmIntegrity_) {
        _disableInitializers();
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(FlowERC20Config calldata config_) external initializer {
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        _saveVMState(config_.vmStateConfig);
        emit Initialize(msg.sender, config_);
    }

    function _rebaseRatio(VMState memory state_)
        internal
        view
        returns (uint256)
    {
        return state_.eval(REBASE_RATIO_ENDPOINT).peek();
    }

    /// User input needs to be divided by the ratio to compensate for the
    /// multiples calculated upon output.
    function rebaseInput(VMState memory state_, uint256 input_)
        internal
        view
        returns (uint256)
    {
        return input_.fixedPointDiv(_rebaseRatio(state_));
    }

    /// Internal data needs to be multiplied by the ratio as it is output.
    /// Inputs will be divided by the ratio when accepted.
    function rebaseOutput(uint256 output_) internal view returns (uint256) {
        return output_.fixedPointMul(_rebaseRatio(_loadVMState()));
    }

    function totalSupply() public view virtual override returns (uint256) {
        return rebaseOutput(super.totalSupply());
    }

    function balanceOf(address account_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return rebaseOutput(super.balanceOf(account_));
    }

    function transferPreflight(
        address from_,
        address to_,
        uint256 amount_
    ) internal view returns (uint256 amountRebased_) {
        VMState memory state_ = _loadVMState();
        amountRebased_ = rebaseInput(state_, amount_);
        state_.context = LibUint256Array.arrayFrom(
            uint256(uint160(from_)),
            uint256(uint160(to_)),
            amount_,
            amountRebased_
        );
        require(
            state_.eval(CAN_TRANSFER_ENDPOINT).peek() > 0,
            "INVALID_TRANSFER"
        );
    }

    function transfer(address to_, uint256 amount_)
        public
        virtual
        override
        returns (bool)
    {
        return super.transfer(to_, transferPreflight(msg.sender, to_, amount_));
    }

    function transferFrom(
        address from_,
        address to_,
        uint256 amount_
    ) public virtual override returns (bool) {
        return
            super.transferFrom(
                from_,
                to_,
                rebaseInput(_loadVMState(), amount_)
            );
    }

    function allowance(address owner_, address spender_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return rebaseOutput(super.allowance(owner_, spender_));
    }

    function approve(address spender_, uint256 amount_)
        public
        virtual
        override
        returns (bool)
    {
        return super.approve(spender_, rebaseInput(_loadVMState(), amount_));
    }

    function increaseAllowance(address spender_, uint256 addedValue_)
        public
        virtual
        override
        returns (bool)
    {
        return
            super.increaseAllowance(
                spender_,
                rebaseInput(_loadVMState(), addedValue_)
            );
    }

    function decreaseAllowance(address spender_, uint256 subtractedValue_)
        public
        virtual
        override
        returns (bool)
    {
        return
            super.decreaseAllowance(
                spender_,
                rebaseInput(_loadVMState(), subtractedValue_)
            );
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        public
        view
        returns (FlowERC20IO memory flowERC20IO_)
    {
        require(
            SourceIndex.unwrap(flow_) > SourceIndex.unwrap(CAN_FLOW_ENDPOINT),
            "FLOW_OOB"
        );
        VMState memory state_ = _loadVMState(
            LibUint256Array.arrayFrom(SourceIndex.unwrap(flow_), id_)
        );
        require(
            SourceIndex.unwrap(flow_) < state_.compiledSources.length,
            "FLOW_OOB"
        );
        require(state_.eval(CAN_FLOW_ENDPOINT).peek() > 0, "CANT_FLOW");
        StackTop stackTop_ = state_.eval(flow_);
        (stackTop_, flowERC20IO_.mint) = stackTop_.pop();
        (stackTop_, flowERC20IO_.burn) = stackTop_.pop();
        flowERC20IO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        returns (FlowERC20IO memory)
    {
        FlowERC20IO memory flowERC20IO_ = previewFlow(flow_, id_);
        if (flowERC20IO_.mint > 0) {
            _mint(msg.sender, flowERC20IO_.mint);
        }
        if (flowERC20IO_.burn > 0) {
            _burn(msg.sender, flowERC20IO_.burn);
        }
        LibFlow.flow(flowERC20IO_.flow, address(this), msg.sender);
        return flowERC20IO_;
    }
}
