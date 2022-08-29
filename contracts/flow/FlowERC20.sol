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
import "../idempotent/LibIdempotentFlag.sol";
import "./FlowVM.sol";

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
        return state_.eval(REBASE_RATIO_ENTRYPOINT).peek();
    }

    function _rebaseInput(uint256 ratio_, uint256 input_)
        internal
        pure
        returns (uint256)
    {
        return input_.fixedPointDiv(ratio_);
    }

    /// User input needs to be divided by the ratio to compensate for the
    /// multiples calculated upon output.
    function _rebaseInput(VMState memory state_, uint256 input_)
        internal
        view
        returns (uint256)
    {
        return _rebaseInput(_rebaseRatio(state_), input_);
    }

    /// Internal data needs to be multiplied by the ratio as it is output.
    /// Inputs will be divided by the ratio when accepted.
    function _rebaseOutput(uint256 output_) internal view returns (uint256) {
        return output_.fixedPointMul(_rebaseRatio(_loadVMState()));
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _rebaseOutput(super.totalSupply());
    }

    function balanceOf(address account_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _rebaseOutput(super.balanceOf(account_));
    }

    function _transferPreflight(
        address from_,
        address to_,
        uint256 amount_
    ) internal view returns (uint256 amountRebased_) {
        VMState memory state_ = _loadVMState();
        amountRebased_ = _rebaseInput(state_, amount_);
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

    function transfer(address to_, uint256 amount_)
        public
        virtual
        override
        returns (bool)
    {
        return super.transfer(to_, _transferPreflight(msg.sender, to_, amount_));
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
                _rebaseInput(_loadVMState(), amount_)
            );
    }

    function allowance(address owner_, address spender_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _rebaseOutput(super.allowance(owner_, spender_));
    }

    function approve(address spender_, uint256 amount_)
        public
        virtual
        override
        returns (bool)
    {
        return super.approve(spender_, _rebaseInput(_loadVMState(), amount_));
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
                _rebaseInput(_loadVMState(), addedValue_)
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
                _rebaseInput(_loadVMState(), subtractedValue_)
            );
    }

    function _previewFlow(
        VMState memory state_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (FlowERC20IO memory flowIO_) {
        StackTop stackTop_ = flowStack(state_, CAN_FLOW_ENTRYPOINT, flow_, id_);
        (stackTop_, flowIO_.mint) = stackTop_.pop();
        (stackTop_, flowIO_.burn) = stackTop_.pop();
        flowIO_.flow = LibFlow.stackToFlow(state_.stackBottom, stackTop_);
        uint256 rebaseRatio_ = _rebaseRatio(state_);
        flowIO_.mint = _rebaseInput(rebaseRatio_, flowIO_.mint);
        flowIO_.burn = _rebaseInput(rebaseRatio_, flowIO_.burn);
        return flowIO_;
    }

    function previewFlow(SourceIndex flow_, uint256 id_)
        external
        view
        virtual
        returns (FlowERC20IO memory flowIO_)
    {
        flowIO_ = _previewFlow(_loadVMState(), flow_, id_);
    }

    function flow(SourceIndex flow_, uint256 id_)
        external
        virtual
        nonReentrant
        returns (FlowERC20IO memory flowIO_)
    {
        VMState memory state_ = _loadVMState();
        flowIO_ = _previewFlow(state_, flow_, id_);
        registerFlowTime(IdempotentFlag.wrap(state_.scratch), flow_, id_);
        _mint(msg.sender, flowIO_.mint);
        _burn(msg.sender, flowIO_.burn);
        LibFlow.flow(flowIO_.flow, address(this), payable(msg.sender));
    }
}
