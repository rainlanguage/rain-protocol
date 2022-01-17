// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Cooldown} from "../cooldown/Cooldown.sol";

import "../vm/RainVM.sol";
import {BlockOps} from "../vm/ops/BlockOps.sol";
import {MathOps} from "../vm/ops/MathOps.sol";
import {SenderOps} from "../vm/ops/SenderOps.sol";
import {TierOps} from "../vm/ops/TierOps.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import "./ISale.sol";
//solhint-disable-next-line max-line-length
import {ITier, RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
//solhint-disable-next-line max-line-length
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

struct ConstructorConfig {
    RedeemableERC20Factory redeemableERC20Factory;
}

struct Config {
    StateConfig vmStateConfig;
    address recipient;
    IERC20 reserve;
    uint256 startBlock;
    // Sale can have an id to disambiguate it from other sales from the same
    // initiator.
    uint256 initialSupply;
    uint256 cooldownDuration;
    uint256 minimumSaleDuration;
    uint256 minimumRaise;
    uint256 dustSize;
}

struct SaleRedeemableERC20Config {
    ERC20Config erc20Config;
    ITier tier;
    uint256 minimumTier;
    uint256 initialSupply;
}

struct BuyConfig {
    uint256 minimumUnits;
    uint256 desiredUnits;
    uint256 maximumPrice;
}

contract Sale is Cooldown, RainVM, ISale {
    using Math for uint256;
    using SafeERC20 for IERC20;

    event Construct(address sender, ConstructorConfig config);
    event Initialize(address sender, Config config, address token);
    event End(address sender);
    event Buy(address sender, BuyConfig config_, uint256 units, uint256 price);
    event Refund(address sender, uint256 units, uint256 price);

    uint256 private constant REMAINING_UNITS = 0;
    uint256 private constant TOTAL_RESERVE_IN = 1;
    uint256 private constant LAST_RESERVE_IN = 2;

    uint256 private constant LAST_BUY_BLOCK = 3;
    uint256 private constant LAST_BUY_UNITS = 4;
    uint256 private constant LAST_BUY_PRICE = 5;

    uint256 internal constant LOCAL_OPS_LENGTH = 6;

    uint256 private immutable blockOpsStart;
    uint256 private immutable senderOpsStart;
    uint256 private immutable mathOpsStart;
    uint256 private immutable tierOpsStart;
    uint256 private immutable localOpsStart;

    RedeemableERC20Factory private immutable redeemableERC20Factory;

    // config.
    address private recipient;
    address private vmStatePointer;
    uint256 private startBlock;
    uint256 private minimumSaleDuration;
    uint256 private minimumRaise;
    uint256 private dustSize;

    IERC20 public reserve;
    RedeemableERC20 public token;

    // state.
    uint256 private remainingUnits;
    uint256 private totalReserveIn;
    uint256 private lastBuyBlock;
    uint256 private lastBuyUnits;
    uint256 private lastBuyPrice;

    SaleStatus private _saleStatus;

    /// Account => price => amount.
    mapping(address => mapping(uint256 => uint256)) public sales;

    constructor(ConstructorConfig memory config_) {
        blockOpsStart = RainVM.OPS_LENGTH;
        senderOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
        mathOpsStart = senderOpsStart + SenderOps.OPS_LENGTH;
        tierOpsStart = mathOpsStart + MathOps.OPS_LENGTH;
        localOpsStart = tierOpsStart + TierOps.OPS_LENGTH;

        redeemableERC20Factory = config_.redeemableERC20Factory;

        emit Construct(msg.sender, config_);
    }

    function initialize(
        Config memory config_,
        SaleRedeemableERC20Config memory saleRedeemableERC20Config_
    ) external {
        initializeCooldown(config_.cooldownDuration);

        vmStatePointer = VMState.snapshot(
            VMState.newState(config_.vmStateConfig)
        );
        recipient = config_.recipient;
        startBlock = config_.startBlock;
        minimumSaleDuration = config_.minimumSaleDuration;
        minimumRaise = config_.minimumRaise;
        dustSize = config_.dustSize;

        reserve = config_.reserve;
        RedeemableERC20 token_ = RedeemableERC20(
            redeemableERC20Factory.createChild(
                abi.encode(
                    RedeemableERC20Config(
                        address(this),
                        address(config_.reserve),
                        saleRedeemableERC20Config_.erc20Config,
                        saleRedeemableERC20Config_.tier,
                        saleRedeemableERC20Config_.minimumTier,
                        saleRedeemableERC20Config_.initialSupply
                    )
                )
            )
        );
        token = token_;

        remainingUnits = saleRedeemableERC20Config_.initialSupply;

        emit Initialize(msg.sender, config_, address(token_));
    }

    function saleStatus() external view returns (SaleStatus) {
        return _saleStatus;
    }

    function end() public {
        require(_saleStatus == SaleStatus.Pending, "ENDED");
        require(
            minimumSaleDuration + startBlock <= uint32(block.number),
            "MIN_DURATION"
        );
        emit End(msg.sender);

        remainingUnits = 0;
        address[] memory distributors_ = new address[](1);
        distributors_[0] = address(this);
        token.burnDistributors(distributors_);

        if (totalReserveIn >= minimumRaise) {
            _saleStatus = SaleStatus.Success;
            reserve.safeTransfer(recipient, reserve.balanceOf(address(this)));
        } else {
            _saleStatus = SaleStatus.Fail;
        }
    }

    function buy(BuyConfig memory config_) external onlyAfterCooldown {
        require(config_.desiredUnits > 0, "0_DESIRED");
        require(
            config_.minimumUnits <= config_.desiredUnits,
            "MINIMUM_OVER_DESIRED"
        );
        require(startBlock <= block.number, "NOT_STARTED");

        require(_saleStatus == SaleStatus.Pending, "ENDED");

        uint256 units_ = config_.desiredUnits.min(remainingUnits).max(
            config_.minimumUnits
        );
        require(units_ <= remainingUnits, "INSUFFICIENT_STOCK");

        State memory state_ = VMState.restore(vmStatePointer);
        eval("", state_, 0);

        uint256 price_ = state_.stack[state_.stackIndex - 1];
        require(price_ <= config_.maximumPrice, "MAXIMUM_PRICE");
        uint256 cost_ = price_ * units_;
        sales[msg.sender][price_] = units_;

        lastBuyBlock = uint32(block.number);
        remainingUnits -= units_;
        lastBuyPrice = price_;
        totalReserveIn += cost_;

        if (remainingUnits < 1) {
            end();
        } else {
            require(remainingUnits >= dustSize, "DUST");
        }

        emit Buy(msg.sender, config_, units_, price_);

        token.transfer(msg.sender, units_);
        reserve.safeTransferFrom(msg.sender, address(this), cost_);
    }

    function refundCooldown() private onlyAfterCooldown {}

    function refund(uint256 price_) external {
        require(_saleStatus != SaleStatus.Success, "REFUND_SUCCESS");

        uint256 units_ = sales[msg.sender][price_];
        uint256 cost_ = price_ * units_;

        totalReserveIn -= cost_;
        remainingUnits += units_;

        delete sales[msg.sender][price_];

        // Only respect/trigger cooldown if the raise is active.
        if (_saleStatus == SaleStatus.Pending) {
            refundCooldown();
        }

        emit Refund(msg.sender, units_, price_);

        token.transferFrom(msg.sender, address(this), units_);
        reserve.safeTransfer(msg.sender, cost_);
    }

    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            if (opcode_ < senderOpsStart) {
                BlockOps.applyOp(
                    context_,
                    state_,
                    opcode_ - blockOpsStart,
                    operand_
                );
            } else if (opcode_ < mathOpsStart) {
                SenderOps.applyOp(
                    context_,
                    state_,
                    opcode_ - senderOpsStart,
                    operand_
                );
            } else if (opcode_ < tierOpsStart) {
                MathOps.applyOp(
                    context_,
                    state_,
                    opcode_ - mathOpsStart,
                    operand_
                );
            } else if (opcode_ < localOpsStart) {
                TierOps.applyOp(
                    context_,
                    state_,
                    opcode_ - tierOpsStart,
                    operand_
                );
            } else {
                opcode_ -= localOpsStart;
                require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
                if (opcode_ == REMAINING_UNITS) {
                    state_.stack[state_.stackIndex] = remainingUnits;
                } else if (opcode_ == TOTAL_RESERVE_IN) {
                    state_.stack[state_.stackIndex] = totalReserveIn;
                } else if (opcode_ == LAST_RESERVE_IN) {
                    state_.stack[state_.stackIndex] =
                        lastBuyUnits *
                        lastBuyPrice;
                } else if (opcode_ == LAST_BUY_BLOCK) {
                    state_.stack[state_.stackIndex] = lastBuyBlock;
                } else if (opcode_ == LAST_BUY_UNITS) {
                    state_.stack[state_.stackIndex] = lastBuyUnits;
                } else if (opcode_ == LAST_BUY_PRICE) {
                    state_.stack[state_.stackIndex] = lastBuyPrice;
                }
                state_.stackIndex++;
            }
        }
    }
}
