// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Cooldown } from "../cooldown/Cooldown.sol";

import "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";
import { SaleOps } from "./ops/SaleOps.sol";

struct Config {
    uint16 seedUnits;
    uint16 cooldownDuration;
    uint32 saleStartBlock;
    uint32 minimumSaleDuration;
    Source priceSource;
    uint256 minimumRaise;
}

struct BuyConfig {
    uint16 minimumUnits;
    uint16 desiredUnits;
    uint256 maximumPrice;
}

enum Status {
    Active,
    Success,
    Fail
}

struct State {
    uint16 lastUnitsSold;
    uint16 remainingUnits;
    uint32 lastBuyBlock;
    uint256 lastBuyPrice;
    uint256 totalRaised;
}

struct Context {
    uint32 saleStartBlock;
    State state;
}

abstract contract Sale is
    Cooldown,
    RainVM,
    ImmutableSource,
    BlockOps,
    MathOps,
    SaleOps {

    using Math for uint256;

    event End();
    event Buy();
    event Refund();

    Status public status;
    uint32 public immutable saleStartBlock;
    uint32 public immutable minimumSaleDuration;
    State public state;
    uint256 public immutable minimumRaise;

    /// Account => price => amount.
    mapping(address => mapping(uint256 => uint16)) public sales;

    constructor(Config memory config_)
        Cooldown(config_.cooldownDuration)
        ImmutableSource(config_.priceSource)
        BlockOps(VM_OPS_LENGTH)
        MathOps(VM_OPS_LENGTH + BLOCK_OPS_LENGTH)
        SaleOps(VM_OPS_LENGTH + BLOCK_OPS_LENGTH + MATH_OPS_LENGTH)
    {
        require(config_.seedUnits > 0, "UNITS_0");

        saleStartBlock = config_.saleStartBlock;
        minimumSaleDuration = config_.minimumSaleDuration;
        minimumRaise = config_.minimumRaise;
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override(RainVM, BlockOps, MathOps, SaleOps)
        view
        returns (Stack memory outStack_)
    {
        if (op_.code < blockOpsStart + BLOCK_OPS_LENGTH) {
            outStack_ = BlockOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < mathOpsStart + MATH_OPS_LENGTH) {
            outStack_ = MathOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < saleOpsStart + SALE_OPS_LENGTH) {
            outStack_ = SaleOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else {
            // Unknown op!
            assert(false);
        }
    }

    function end() public {
        require(
            minimumSaleDuration + saleStartBlock <= uint32(block.number)
            || state.remainingUnits < 1,
            "EARLY_END"
        );
        require(status == Status.Active, "NOT_ACTIVE");
        if (state.totalRaised >= minimumRaise) {
            status = Status.Success;
        }
        else {
            status = Status.Fail;
        }
        emit End();
    }

    function buy(BuyConfig memory config_) external onlyAfterCooldown {
        require(config_.desiredUnits > 0, "0_DESIRED");
        require(
            config_.minimumUnits <= config_.desiredUnits,
            "MINIMUM_OVER_DESIRED"
        );
        require(
            config_.minimumUnits <= state.remainingUnits,
            "INSUFFICIENT_STOCK"
        );
        require(saleStartBlock <= uint32(block.number), "NOT_STARTED");

        require(status == Status.Active, "NOT_ACTIVE");

        Context memory context_ = Context(
            saleStartBlock,
            state
        );

        uint16 units_ = uint16(uint256(config_.desiredUnits)
            .min(context_.state.remainingUnits));

        Stack memory stack_;
        stack_ = eval(
            abi.encode(context_),
            source(),
            stack_
        );
        uint256 price_ = stack_.vals[stack_.index - 1];
        require(price_ <= config_.maximumPrice, "MAXIMUM_PRICE");
        uint256 cost_ = price_ * units_;
        sales[msg.sender][price_] = units_;

        state.lastBuyBlock = uint32(block.number);
        state.remainingUnits -= units_;
        state.lastBuyPrice = price_;
        state.totalRaised += cost_;

        if (state.remainingUnits < 1) {
            end();
        }

        emit Buy();

        afterBuy_(units_, cost_);
    }

    function afterBuy_(uint16 units_, uint256 cost_) public virtual { }

    function refundCooldown() private onlyAfterCooldown { }

    function refund(uint256 price_) external {
        require(status != Status.Success, "REFUND_SUCCESS");

        uint16 units_ = sales[msg.sender][price_];
        uint256 cost_ = price_ * units_;

        state.totalRaised -= cost_;
        state.remainingUnits += units_;

        delete sales[msg.sender][price_];

        // Only respect/trigger cooldown if the raise is active.
        if (status == Status.Active) {
            refundCooldown();
        }

        emit Refund();

        afterRefund_(units_, cost_);
    }

    function afterRefund_(uint16 units, uint256 cost_) public virtual { }
}