// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

enum Ops {
    report,
    never,
    always,
    diff,
    updateBlocksForTierRange,
    everyLteMin,
    everyLteMax,
    everyLteFirst,
    anyLteMin,
    anyLteMax,
    anyLteFirst,
    length
}

library TierOps {

    function applyOp(
        bytes memory,
        State memory state_,
        Op memory op_
    )
    internal
    view {
        if (op_.code == uint8(Ops.report)) {
            state_.stackIndex -= 2;
            state_.stack[state_.stackIndex] =
                ITier(address(uint160(state_.stack[state_.stackIndex + 1])))
                    .report(address(uint160(state_.stack[state_.stackIndex])));
            state_.stackIndex++;
        }
        else if (op_.code == uint8(Ops.never)) {
            state_.stack[state_.stackIndex] = TierReport.NEVER;
            state_.stackIndex++;
        }
        else if (op_.code == uint8(Ops.always)) {
            state_.stack[state_.stackIndex] = TierReport.ALWAYS;
            state_.stackIndex++;
        }
        else if (op_.code == uint8(Ops.diff)) {
            state_.stackIndex -= 2;
            uint256 olderReport_ = state_.stack[state_.stackIndex];
            uint256 newerReport_ = state_.stack[state_.stackIndex + 1];
            state_.stack[state_.stackIndex] = TierwiseCombine.diff(
                olderReport_,
                newerReport_
            );
            state_.stackIndex++;
        }
        else if (op_.code == uint8(Ops.updateBlocksForTierRange)) {
            ITier.Tier startTier_ = ITier.Tier(op_.val & 0x0f);
            ITier.Tier endTier_ = ITier.Tier((op_.val >> 4) & 0x0f);
            state_.stackIndex -= 2;
            uint256 blockNumber_ = state_.stack[state_.stackIndex];
            uint256 report_ = state_.stack[state_.stackIndex + 1];
            state_.stack[state_.stackIndex]
                = TierReport.updateBlocksForTierRange(
                    report_,
                    startTier_,
                    endTier_,
                    blockNumber_
                );
            state_.stackIndex++;
        }
        // All the combinators share the same stack and argument handling.
        else {
            state_.stackIndex -= op_.val + 1;
            uint256[] memory args_ = new uint256[](op_.val);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = state_.stack[state_.stackIndex + a_ + 1];
            }

            uint256 blockNumber_ = state_.stack[state_.stackIndex];

            if (op_.code == uint8(Ops.everyLteMin)) {
                state_.stack[state_.stackIndex] = TierwiseCombine.everyLteMin(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.everyLteMax)) {
                state_.stack[state_.stackIndex] = TierwiseCombine.everyLteMax(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.everyLteFirst)) {
                state_.stack[state_.stackIndex]
                    = TierwiseCombine.everyLteFirst(
                        args_,
                        blockNumber_
                    );
            }
            else if (op_.code == uint8(Ops.anyLteMin)) {
                state_.stack[state_.stackIndex] = TierwiseCombine.anyLteMin(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.anyLteMax)) {
                state_.stack[state_.stackIndex] = TierwiseCombine.anyLteMax(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint(Ops.anyLteFirst)) {
                state_.stack[state_.stackIndex] = TierwiseCombine.anyLteFirst(
                    args_,
                    blockNumber_
                );
            }

            state_.stackIndex++;
        }
    }

}