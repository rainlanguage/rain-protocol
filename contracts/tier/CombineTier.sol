// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import { RainVM, Stack, Op, Ops as RainVMOps } from "../vm/RainVM.sol";
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

    constructor(ChunkedSource memory source_)
        ImmutableSource(source_)
    {
        blockOpsStart = uint8(RainVMOps.length);
        tierOpsStart = blockOpsStart + uint8(BlockOpsOps.length);
        combineTierOpsStart = tierOpsStart + uint8(TierOpsOps.length);
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
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
                stack_,
                op_
            );
        }
        else if (op_.code < combineTierOpsStart) {
            op_.code -= tierOpsStart;
            TierOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else {
            op_.code -= combineTierOpsStart;
            if (op_.code == uint8(Ops.account)) {
                (address account_) = abi.decode(context_, (address));
                stack_.vals[stack_.index] = uint256(uint160(account_));
                stack_.index++;
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
        Stack memory stack_;
        eval(
            abi.encode(account_),
            source(),
            stack_
        );
        return stack_.vals[stack_.index - 1];
    }

    function reportStack(address account_)
        external
        view
        virtual
        returns (Stack memory)
    {
        Stack memory stack_;
        eval(
            abi.encode(account_),
            source(),
            stack_
        );
        return stack_;
    }
}