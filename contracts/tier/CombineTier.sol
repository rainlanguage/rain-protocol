// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { TierOps } from "../vm/ops/TierOps.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

contract CombineTier is
    ReadOnlyTier,
    RainVM,
    ImmutableSource
{
    uint internal ACCOUNT = 0;
    uint internal immutable blockOpsStart;
    uint internal immutable tierOpsStart;
    uint internal immutable combineTierOpsStart;

    constructor(ImmutableSourceConfig memory config_)
        ImmutableSource(config_)
    {
        blockOpsStart = RainVM.OPS_LENGTH;
        tierOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
        combineTierOpsStart = tierOpsStart + TierOps.OPS_LENGTH;
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
        unchecked {
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
                if (op_.code == ACCOUNT) {
                    (address account_) = abi.decode(context_, (address));
                    state_.stack[state_.stackIndex]
                        = uint256(uint160(account_));
                    state_.stackIndex++;
                }
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