// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { TierOps } from "../vm/ops/TierOps.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

enum Ops {
    account
}

contract CombineTier is
    ReadOnlyTier,
    RainVM,
    ImmutableSource,
    BlockOps,
    TierOps
{
    uint8 public immutable opcodeCombineStart;
    uint8 public immutable opcodeCombineTierAccount;
    uint8 public constant COMBINE_TIER_OPS_LENGTH = 1;

    constructor(Source memory source_)
        ImmutableSource(source_)
        BlockOps(VM_OPS_LENGTH)
        TierOps(VM_OPS_LENGTH + BLOCK_OPS_LENGTH)
    {
        opcodeCombineStart = tierOpsStart + TIER_OPS_LENGTH;
        opcodeCombineTierAccount = opcodeCombineStart + uint8(Ops.account);
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override(RainVM, BlockOps, TierOps)
        view
        returns (Stack memory)
    {
        if (op_.code < blockOpsStart + BLOCK_OPS_LENGTH) {
            stack_ = BlockOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < tierOpsStart + TIER_OPS_LENGTH) {
            stack_ = TierOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code == opcodeCombineTierAccount) {
            (address account_) = abi.decode(context_, (address));
            stack_.vals[stack_.index] = uint256(uint160(account_));
            stack_.index++;
        }
        else {
            // Unknown op!
            assert(false);
        }

        return stack_;
    }

    function report(address account_)
        external
        view
        override
        virtual
        returns (uint256)
    {
        Stack memory stack_;
        stack_ = eval(
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
        stack_ = eval(
            abi.encode(account_),
            source(),
            stack_
        );
        return stack_;
    }
}