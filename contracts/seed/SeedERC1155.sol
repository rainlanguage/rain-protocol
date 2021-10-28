// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import { RainCompiler, Source, Stack, Op } from "../compiler/RainCompiler.sol";

import { Phase, Phased } from "../phased/Phased.sol";
import { Cooldown } from "../cooldown/Cooldown.sol";

enum Status {
    Active,
    Success,
    Fail
}

/// Everything required to construct a `SeedERC20` contract.
struct Input {
    uint256 id;
    uint256 minimumRaise;
    // Reserve erc20 token contract used to purchase seed tokens.
    IERC20 reserve;
    // Cooldown duration in blocks for seed/unseed cycles.
    // Seeding requires locking funds for at least the cooldown period.
    // Ideally `unseed` is never called and `seed` leaves funds in the contract
    // until all seed tokens are sold out.
    // A failed raise cannot make funds unrecoverable, so `unseed` does exist,
    // but it should be called rarely.
    uint16 cooldownDuration;
    // Recipient address for all reserve funds raised when seeding is complete.
    address recipient;
    // Total seed units to be mint and sold.
    // 100% of all seed units must be sold for seeding to complete.
    // Recommended to keep seed units to a small value (single-triple digits).
    // The ability for users to buy/sell or not buy/sell dust seed quantities
    // is likely NOT desired.
    uint16 units;
    uint32 canEndAfter;
    // Price per seed unit denominated in reserve token.
    Source priceSource;
}

struct Definition {
    SaleInput input;
    address initiator;
    uint32 startBlock;
}

struct State {
    /// Most recent block number a buy was processed OR startBlock if none.
    uint32 lastBuyBlock;
    /// Most recent block number a refund was processed OR startBlock if none.
    uint32 lastRefundBlock;
    /// Remaining unsold units.
    uint16 remainingUnits;
    /// Most recent price a buy occured at OR zero if no buys so far.
    uint256 lastBuyPrice;
    /// Total amount of reserve raised so far.
    uint256 reserveRaised;
}

struct Context {
    uint32 startBlock;
    SaleState state;
}

/// @title SeedERC20
/// @notice Facilitates raising seed reserve from an open set of seeders.
///
/// When a single seeder address cannot be specified at the time the
/// `Trust` is constructed a `SeedERC20` will be deployed.
///
/// The `SeedERC20` has two phases:
///
/// - `Phase.ZERO`: Can swap seed tokens for reserve assets with
/// `seed` and `unseed`
/// - `Phase.ONE`: Can redeem seed tokens pro-rata for reserve assets
///
/// When the last seed token is distributed the `SeedERC20`
/// immediately moves to `Phase.ONE` atomically within that
/// transaction and forwards all reserve to the configured recipient.
///
/// For our use-case the recipient is a `Trust` contract but `SeedERC20`
/// could be used as a mini-fundraise contract for many purposes. In the case
/// that a recipient is not a `Trust` the recipient will need to be careful not
/// to fall afoul of KYC and securities law.
///
/// @dev Facilitates a pool of reserve funds to forward to a named recipient
/// contract.
/// The funds to raise and the recipient is fixed at construction.
/// The total is calculated as `( seedPrice * seedUnits )` and so is a fixed
/// amount. It is recommended to keep seedUnits relatively small so that each
/// unit represents a meaningful contribution to keep dust out of the system.
///
/// The contract lifecycle is split into two phases:
///
/// - `Phase.ZERO`: the `seed` and `unseed` functions are callable by anyone.
/// - `Phase.ONE`: holders of the seed erc20 token can redeem any reserve funds
///   in the contract pro-rata.
///
/// When `seed` is called the `SeedERC20` contract takes ownership of reserve
/// funds in exchange for seed tokens.
/// When `unseed` is called the `SeedERC20` contract takes ownership of seed
/// tokens in exchange for reserve funds.
///
/// When the last `seed` token is transferred to an external address the
/// `SeedERC20` contract immediately:
///
/// - Moves to `Phase.ONE`, disabling both `seed` and `unseed`
/// - Transfers the full balance of reserve from itself to the recipient
///   address.
///
/// Seed tokens are standard ERC20 so can be freely transferred etc.
///
/// The recipient (or anyone else) MAY transfer reserve back to the `SeedERC20`
/// at a later date.
/// Seed token holders can call `redeem` in `Phase.ONE` to burn their tokens in
/// exchange for pro-rata reserve assets.
contract SeedERC1155 is Ownable, ERC1155, Cooldown, RainCompiler {

    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;

    uint8 public constant OPCODE_START_BLOCK = 1 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_LAST_BUY_BLOCK = 2 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_LAST_REFUND_BLOCK = 3 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_REMAINING_UNITS = 4 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_LAST_BUY_PRICE = 5 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_RESERVE_RAISED = 6 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_SALE_CONTEXT_MAX = OPCODE_RESERVE_RAISED;

    uint8 public constant OPCODE_ADD = 1 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_SUB = 2 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_MUL = 3 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_DIV = 4 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_MOD = 5 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_POW = 6 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_MIN = 7 + OPCODE_SALE_CONTEXT_MAX;
    uint8 public constant OPCODE_MAX = 8 + OPCODE_SALE_CONTEXT_MAX;

    event Sale(Definition definition);
    event End(Definition definition_);

    mapping(uint256 => bool) public receipts;
    mapping(uint256 => State) public states;
    mapping(uint256 => Status) public statuses;
    // id => seeder => price => amount
    mapping(uint256 => mapping(address => mapping(uint256 => uint16)))
        public sales;

    constructor ()
    public
    ERC1155("")
    RainCompiler(Source(
        [uint256(0), 0, 0, 0],
        [uint256(0), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ))
    { }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
    internal
    override
    virtual
    view
    // solhint-disable-next-line no-empty-blocks
    returns (Stack memory) {
        Context memory context_ = abi.decode(context_, (Context));
        // Everything within sale context adds some value on the stack.
        if (op_.code <= OPCODE_SALE_CONTEXT_MAX) {
            if (op_.code == OPCODE_START_BLOCK) {
                stack_.vals[stack_.index] = uint256(context_.startBlock);
            }
            else if (op_.code == OPCODE_LAST_BUY_BLOCK) {
                stack_.vals[stack_.index]
                    = uint256(context_.state.lastBuyBlock);
            }
            else if (op_.code == OPCODE_LAST_REFUND_BLOCK) {
                stack_.vals[stack_.index]
                    = uint256(context_.state.lastRefundBlock);
            }
            else if (op_.code == OPCODE_REMAINING_UNITS) {
                stack_.vals[stack_.index]
                    = uint256(context_.state.remainingUnits);
            }
            else if (op_.code == OPCODE_LAST_BUY_PRICE) {
                stack_.vals[stack_.index]
                    = uint256(context_.state.lastBuyPrice);
            }
            else if (op_.code == OPCODE_RESERVE_RAISED) {
                stack_.vals[stack_.index]
                    = uint256(context_.state.reserveRaised);
            }
        }
        // The mathematical operations consume values from the stack before
        // adding their output to the stack.
        else {
            stack_.index -= op_.val;
            uint256 accumulator_ = 0;
            uint256 val_ = 0;
            for (uint256 a_ = 0; a_ < op_.val; a_++) {
                val_ = stack_.vals[stack_.index + a_];
                if (op_.code == OPCODE_ADD) {
                    accumulator_ = accumulator_.add(val_);
                }
                else if (op_.code == OPCODE_SUB) {
                    accumulator_ = accumulator_.sub(val_);
                }
                else if (op_.code == OPCODE_MUL) {
                    accumulator_ = accumulator_.mul(val_);
                }
                else if (op_.code == OPCODE_DIV) {
                    if (a_ == 0) {
                        accumulator_ = val_;
                    }
                    else {
                        accumulator_ = accumulator_.div(val_);
                    }
                }
                else if (op_.code == OPCODE_MOD) {
                    if (a_ == 0) {
                        accumulator_ = val_;
                    }
                    else {
                        accumulator_ = accumulator_.mod(val_);
                    }
                }
                else if (op_.code == OPCODE_MIN) {
                    accumulator_ = accumulator_.min(val_);
                }
                else if (op_.code == OPCODE_MAX) {
                    accumulator_ = accumulator_.max(val_);
                }
            }
            stack_.vals[stack_.index] = accumulator_;
        }
        stack_.index++;
    }

    function define(Input input_) external returns (SaleDefinition) {
        require(input_.seedUnits > 0, "UNITS_0");
        SaleDefinition definition_ = Definition(
            input_,
            msg.sender,
            block.number
        );
        uint256 id_ = kekkack(definition_);
        states[id_] = State(
            uint32(block.number),
            uint32(block.number),
            uint32(block.number),
            input_.units,
            0,
            0
        );
        statuses[id_] = Status.Active;
        emit Sale(definition_);
        return definition_;
    }

    function end(Definition definition_) public {
        uint256 id_ = keccack(definition_);
        State state_ = state[id_];
        delete states[id_];
        require(
            definition_.canEndAfter + definition_.startBlock
                <= uint32(block.number)
            || state_.remainingUnits < 1,
            "EARLY_END"
        );
        require(statuses[id_] == Status.Active, "NOT_ACTIVE");
        if (state_.reserveRaised >= definition_.minimumRaise) {
            statuses[id_] = Status.Success;
        }
        else {
            statuses[id_] = Status.Fail;
        }
        emit End(definition_);
    }

    function buy(
        Definition definition_,
        uint256 minimumUnits_,
        uint256 desiredUnits_
    )
        external
        onlyAfterCooldown(id_)
    {
        require(desiredUnits_ > 0, "DESIRED_0");
        require(minimumUnits_ <= desiredUnits_, "MINIMUM_OVER_DESIRED");

        uint256 id_ = keccack(definition_);
        require(statuses[id_] == Status.Active, "NOT_ACTIVE");

        State memory state_ = states[id_];
        Context memory context_ = Context(
            definition_.startBlock,
            state_
        );

        // Calculate price before updating sale state.
        Stack memory stack_;
        stack_ = eval(
            abi.encode(context_),
            config_.seedPriceSource,
            stack_
        );
        uint256 price_ = stack_.vals[stack_.index - 1];

        require(
            minimumUnits_ <= saleState_.remainingUnits,
            "INSUFFICIENT_STOCK"
        );

        uint256 units_ = desiredUnits_.min(saleState_.remainingUnits);
        uint256 reserveAmount_ = price_.mul(units_);

        // Update sale state.
        state_.lastBuyBlock = uint32(block.number);

        state_.remainingUnits = uint16(
            uint256(saleState_.remainingUnits).sub(units_)
        );
        state_.lastBuyPrice = price_;
        state_.reserveRaised = saleState_.reserveRaised
            .add(reserveAmount_);
        states[id_] = state_;

        _mint(
            msg.sender,
            id_,
            uint256(units_),
            ""
        );

        // If `remainingStock_` is less than units then the transfer below will
        // fail and rollback.
        if (state_.remainingUnits < 1) {
            end(definition_);
        }

        definition_.input.reserve.safeTransferFrom(
            msg.sender,
            address(this),
            reserveAmount_
        );
    }

    function receive(Definition definition_) {
        require(msg.sender == definition_.input.recipient, "RECIPIENT");
        uint256 id_ = keccack(definition_);
        require(receipts[id_] == false, "DOUBLE_RECEIVE");
        if (statuses[id_] == Status.Success) {
            receipts[id_] = true;
            definition_.input.reserve.safeTransfer(
                definition_.input.recipient,
                state_.reserveRaised
            );
        }
    }

    function refundCooldown(uint256 id_) private onlyAfterCooldown(id_) { }

    /// Send reserve back to seeder as `( units * seedPrice )`.
    ///
    /// Allows addresses to back out until `Phase.ONE`.
    /// Unlike `redeem` the seed tokens are NOT burned so become newly
    /// available for another account to `seed`.
    ///
    /// In `Phase.ONE` the only way to recover reserve assets is:
    /// - Wait for the recipient or someone else to deposit reserve assets into
    ///   this contract.
    /// - Call redeem and burn the seed tokens
    function refund(Definition definition_, uint256 price_) external {
        uint256 id_ = keccack(definition_);

        uint16 units_ = sales[id_][msg.sender][price_];
        uint256 reserveAmount_ = price_.mul(units_);

        State memory state_ = states[id_];
        state_.lastRefundBlock = uint32(block.number);
        state_.reserveRaised = state_.reserveRaised
            .sub(reserveAmount_);
        // Can't overflow because we're adding what previously was there.
        state_.remainingUnits += units_;
        states[id_] = state_;

        delete sales[id_][msg.sender][price_];

        Status status_ = statuses_[id_];
        if (status_ == Status.Active) {
            // Cooldowns apply while sale is active.
            refundCooldown(id_);

            // Sale still active so burn units to allow others to buy.
            _burn(
                msg.sender,
                id_,
                units_,
                ""
            );
        }

        // Reentrant reserve transfer.
        definition_.input.reserve.safeTransfer(
            msg.sender,
            reserveAmount_
        );
    }

    function _beforeTokenTransfer(
        address operator_,
        address from_,
        address to_,
        uint256[] memory ids_,
        uint256[] memory amounts_,
        bytes memory data_
    ) internal virtual override {
        super._beforeTokenTransfer(
            operator_,
            from_,
            to_,
            ids_,
            amounts_,
            data_
        );
        for (uint256 i_ = 0; i_ < ids_.length; i_++) {
            require(statuses[ids_[i_]] != Status.Success, "FROZEN");
        }
    }
}