// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps, Ops as BlockOpsOps } from "../vm/ops/BlockOps.sol";
import { TierOps, Ops as TierOpsOps } from "../vm/ops/TierOps.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

enum Ops {
    account
}

contract CombineTier is
    ReadOnlyTier,
    RainVM,
    ImmutableSource
{
    uint8 public immutable blockOpsStart;
    uint8 public immutable tierOpsStart;
    uint8 public immutable combineTierOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        blockOpsStart = uint8(RainVM.OPS_LENGTH);
        tierOpsStart = blockOpsStart + uint8(BlockOpsOps.length);
        combineTierOpsStart = tierOpsStart + uint8(TierOpsOps.length);
    }

    function applyOp(
        bytes memory context_,
        State memory state_,
        Op memory op_
    )
        internal
        override
        view
    {
        if (op_.code < tierOpsStart) {
            op_.code -= blockOpsStart;
            BlockOps.applyOp(
                context_,
                state_,
                op_
            );
        }
        else if (op_.code < combineTierOpsStart) {
            op_.code -= tierOpsStart;
            TierOps.applyOp(
                context_,
                state_,
                op_
            );
        }
        else {
            op_.code -= combineTierOpsStart;
            if (op_.code == uint8(Ops.account)) {
                (address account_) = abi.decode(context_, (address));
                state_.stack[state_.stackIndex] = uint256(uint160(account_));
                state_.stackIndex++;
            }
        }
    }

    function report(address account_)
        external
        view
        override
        virtual
        returns (uint256)
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