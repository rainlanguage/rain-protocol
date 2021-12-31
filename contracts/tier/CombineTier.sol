// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { RainVM, State } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { TierOps } from "../vm/ops/TierOps.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

/// @title CombineTier
/// @notice Implements `ReadOnlyTier` over RainVM. Allows combining the reports
/// from any other `ITier` contracts referenced in the `ImmutableSource` set at
/// construction.
/// The value at the top of the stack after executing the rain script will be
/// used as the return of `report`.
contract CombineTier is
    ReadOnlyTier,
    RainVM,
    ImmutableSource
{
    /// @dev local opcode to put tier report account on the stack.
    uint internal constant ACCOUNT = 0;
    /// local opcodes length.
    uint public constant LOCAL_OPS_LENGTH = 1;

    /// @dev local offset for block ops.
    uint internal immutable blockOpsStart;
    /// @dev local offset for tier ops.
    uint internal immutable tierOpsStart;
    /// @dev local offset for combine tier ops.
    uint internal immutable localOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        blockOpsStart = RainVM.OPS_LENGTH;
        tierOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
        localOpsStart = tierOpsStart + TierOps.OPS_LENGTH;
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint opcode_,
        uint operand_
    )
        internal
        override
        view
    {
        unchecked {
            if (opcode_ < tierOpsStart) {
                BlockOps.applyOp(
                    context_,
                    state_,
                    opcode_ - blockOpsStart,
                    operand_
                );
            }
            else if (opcode_ < localOpsStart) {
                TierOps.applyOp(
                    context_,
                    state_,
                    opcode_ - tierOpsStart,
                    operand_
                );
            }
            else {
                opcode_ -= localOpsStart;
                require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
                if (opcode_ == ACCOUNT) {
                    (address account_) = abi.decode(context_, (address));
                    state_.stack[state_.stackIndex]
                        = uint256(uint160(account_));
                    state_.stackIndex++;
                }
            }
        }
    }

    /// @inheritdoc ITier
    function report(address account_)
        external
        view
        override
        virtual
        returns (uint)
    {
        State memory state_ = newState();
        eval(
            abi.encode(account_),
            state_,
            0
        );
        return state_.stack[state_.stackIndex - 1];
    }
}