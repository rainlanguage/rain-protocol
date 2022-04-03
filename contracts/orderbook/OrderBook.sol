// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/RainVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../math/FixedPointMath.sol";
import "../vm/ops/AllStandardOps.sol";

struct Order {
    address sender;
    address offers;
    address wants;
    uint256 amount;
    State price;
}

contract OrderBook is RainVM {
    using SafeERC20 for IERC20;
    using FixedPointMath for uint256;
    event Claim(address sender, uint256 amount);
    event Bid(address sender, Order bid);
    event Ask(address sender, Order ask);
    event Execute(address sender, Order bid, Order ask);

    uint256 private constant OPCODE_COUNTERPARTY = 0;

    uint256 internal constant LOCAL_OPS_LENGTH = 1;

    uint256 private immutable localOpsStart;

    mapping(bytes32 => uint256) private bids;
    mapping(bytes32 => uint256) private asks;
    // account => token => amount
    mapping(address => mapping(address => uint256)) private claimable;

    constructor() {
        localOpsStart = ALL_STANDARD_OPS_START + ALL_STANDARD_OPS_LENGTH;
    }

    function claim(address token_) external {
        uint256 amount_ = claimable[msg.sender][token_];
        delete claimable[msg.sender][token_];
        emit Claim(msg.sender, amount_);
        IERC20(token_).safeTransfer(msg.sender, amount_);
    }

    function bid(Order calldata bid_) external {
        require(bid_.sender == msg.sender, "DELEGATED_BID");
        bids[keccak256(abi.encode(bid_))] += bid_.amount;
        emit Bid(msg.sender, bid_);
        IERC20(bid_.offers).safeTransferFrom(
            msg.sender,
            address(this),
            bid_.amount
        );
    }

    function ask(Order calldata ask_) external {
        require(ask_.sender == msg.sender, "DELEGATED_ASK");
        asks[keccak256(abi.encode(ask_))] += ask_.amount;
        emit Ask(msg.sender, ask_);
        IERC20(ask_.offers).safeTransferFrom(
            msg.sender,
            address(this),
            ask_.amount
        );
    }

    function execute(Order calldata bid_, Order calldata ask_) external {
        require(bid_.offers == ask_.wants, "ORDER_MISMATCH");
        require(ask_.offers == bid_.wants, "ORDER_MISMATCH");

        bytes32 bidsKey_ = keccak256(abi.encode(bid_));
        bytes32 asksKey_ = keccak256(abi.encode(ask_));

        uint256 bidOffersAmount_ = bids[bidsKey_];
        uint256 askOffersAmount_ = asks[asksKey_];

        // Price is want/offer for both bids and asks.
        eval(abi.encode(ask_.sender), bid_.price, 0);
        eval(abi.encode(bid_.sender), ask_.price, 0);
        uint256 bidPrice_ = bid_.price.stack[bid_.price.stackIndex];
        uint256 askPrice_ = ask_.price.stack[ask_.price.stackIndex];

        uint256 bidWantsAmount_ = bidOffersAmount_.fixedPointMul(bidPrice_);
        uint256 askWantsAmount_ = askOffersAmount_.fixedPointMul(askPrice_);

        // Bid wants everything ask is offering, so ask is cleared out of the
        // system. Bid will pay their price for the amount that ask is offering
        // which must be equal to or higher than what ask wants. If bid pays
        // more than ask wants then `msg.sender` gets to keep the difference.
        if (askOffersAmount_ <= bidWantsAmount_) {
            uint256 bidPaysAmount_ = askOffersAmount_.fixedPointDiv(bidPrice_);
            delete asks[asksKey_];
            bids[bidsKey_] -= bidPaysAmount_;

            // This needs to rollback on overflow as it implies that the bid
            // pays amount is insufficient to cover what ask wants.
            claimable[msg.sender][ask_.wants] +=
                bidPaysAmount_ -
                askWantsAmount_;
            claimable[ask_.sender][ask_.wants] += askWantsAmount_;
            claimable[bid_.sender][bid_.wants] += askOffersAmount_;
        }
        // Ask is offering more than bid wants, so bid is cleared out of the
        // system. Ask will pay their price for the amount that bid wants which
        // must be
        else {
            uint256 askPaysAmount_ = bidOffersAmount_.fixedPointDiv(askPrice_);
            asks[asksKey_] -= askPaysAmount_;
            delete bids[bidsKey_];

            // This needs to rollback on overflow as it implies that the bid
            // wants more than ask is paying.
            claimable[msg.sender][bid_.wants] +=
                askPaysAmount_ -
                bidWantsAmount_;
            claimable[bid_.sender][bid_.wants] += bidWantsAmount_;
            claimable[ask_.sender][ask_.wants] += bidOffersAmount_;
        }
        emit Execute(msg.sender, bid_, ask_);
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        if (opcode_ < localOpsStart) {
            AllStandardOps.applyOp(
                state_,
                opcode_ - ALL_STANDARD_OPS_START,
                operand_
            );
        } else {
            opcode_ -= localOpsStart;
            require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
            address counterparty_ = abi.decode(context_, (address));
            state_.stack[state_.stackIndex] = uint256(uint160(counterparty_));
            state_.stackIndex++;
        }
    }
}
