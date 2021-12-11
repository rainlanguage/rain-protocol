// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Stack, Op } from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

import "hardhat/console.sol";

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
        Stack memory stack_,
        Op memory op_
    )
    internal
    view {
        if (op_.code == uint8(Ops.report)) {
            console.log("report stack: %s", stack_.index);
            console.log(
                "report: %s %s",
                stack_.vals[stack_.index - 2],
                stack_.vals[stack_.index - 1]
            );
            stack_.index -= 2;
            stack_.vals[stack_.index] =
                ITier(address(uint160(stack_.vals[stack_.index + 1])))
                    .report(address(uint160(stack_.vals[stack_.index])));
            stack_.index++;
        }
        else if (op_.code == uint8(Ops.never)) {
            stack_.vals[stack_.index] = TierReport.NEVER;
            stack_.index++;
        }
        else if (op_.code == uint8(Ops.always)) {
            stack_.vals[stack_.index] = TierReport.ALWAYS;
            stack_.index++;
        }
        else if (op_.code == uint8(Ops.diff)) {
            stack_.index -= 2;
            uint256 olderReport_ = stack_.vals[stack_.index];
            uint256 newerReport_ = stack_.vals[stack_.index + 1];
            stack_.vals[stack_.index] = TierwiseCombine.diff(
                olderReport_,
                newerReport_
            );
            stack_.index++;
        }
        else if (op_.code == uint8(Ops.updateBlocksForTierRange)) {
            ITier.Tier startTier_ = ITier.Tier(op_.val & 0x0f);
            ITier.Tier endTier_ = ITier.Tier((op_.val >> 4) & 0x0f);
            stack_.index -= 2;
            uint256 blockNumber_ = stack_.vals[stack_.index];
            uint256 report_ = stack_.vals[stack_.index + 1];
            stack_.vals[stack_.index] = TierReport.updateBlocksForTierRange(
                report_,
                startTier_,
                endTier_,
                blockNumber_
            );
            stack_.index++;
        }
        // All the combinators share the same stack and argument handling.
        else {
            stack_.index -= op_.val + 1;
            uint256[] memory args_ = new uint256[](op_.val);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_.vals[stack_.index + a_ + 1];
            }

            uint256 blockNumber_ = stack_.vals[stack_.index];

            if (op_.code == uint8(Ops.everyLteMin)) {
                stack_.vals[stack_.index] = TierwiseCombine.everyLteMin(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.everyLteMax)) {
                stack_.vals[stack_.index] = TierwiseCombine.everyLteMax(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.everyLteFirst)) {
                stack_.vals[stack_.index] = TierwiseCombine.everyLteFirst(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.anyLteMin)) {
                stack_.vals[stack_.index] = TierwiseCombine.anyLteMin(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint8(Ops.anyLteMax)) {
                stack_.vals[stack_.index] = TierwiseCombine.anyLteMax(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == uint(Ops.anyLteFirst)) {
                stack_.vals[stack_.index] = TierwiseCombine.anyLteFirst(
                    args_,
                    blockNumber_
                );
            }

            stack_.index++;
        }
    }

}