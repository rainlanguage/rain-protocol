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
        unchecked {
            uint baseIndex_;
            if (op_.code == 0) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                state_.stack[baseIndex_] =
                    ITier(address(uint160(state_.stack[baseIndex_ + 1])))
                        .report(address(uint160(state_.stack[baseIndex_])));
                state_.stackIndex++;
            }
            else if (op_.code == 1) {
                state_.stack[state_.stackIndex] = TierReport.NEVER;
                state_.stackIndex++;
            }
            else if (op_.code == 2) {
                state_.stack[state_.stackIndex] = TierReport.ALWAYS;
                state_.stackIndex++;
            }
            else if (op_.code == 3) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                uint256 olderReport_ = state_.stack[baseIndex_];
                uint256 newerReport_ = state_.stack[baseIndex_ + 1];
                state_.stack[state_.stackIndex] = TierwiseCombine.diff(
                    olderReport_,
                    newerReport_
                );
                state_.stackIndex++;
            }
            else if (op_.code == 4) {
                ITier.Tier startTier_ = ITier.Tier(op_.val & 0x0f);
                ITier.Tier endTier_ = ITier.Tier((op_.val >> 4) & 0x0f);
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                uint256 blockNumber_ = state_.stack[baseIndex_];
                uint256 report_ = state_.stack[baseIndex_ + 1];
                state_.stack[baseIndex_]
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
                uint opval_ = op_.val;
                state_.stackIndex -= opval_ + 1;
                baseIndex_ = state_.stackIndex;
                uint256[] memory args_ = new uint256[](opval_);
                for (uint256 a_ = 0; a_ < opval_; a_++) {
                    args_[a_] = state_.stack[baseIndex_ + a_ + 1];
                }

                uint256 blockNumber_ = state_.stack[baseIndex_];

                if (op_.code == 5) {
                    state_.stack[baseIndex_]
                         = TierwiseCombine.everyLteMin(
                            args_,
                            blockNumber_
                        );
                }
                else if (op_.code == 6) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.everyLteMax(
                            args_,
                            blockNumber_
                        );
                }
                else if (op_.code == 7) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.everyLteFirst(
                            args_,
                            blockNumber_
                        );
                }
                else if (op_.code == 8) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLteMin(
                            args_,
                            blockNumber_
                        );
                }
                else if (op_.code == 9) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLteMax(
                            args_,
                            blockNumber_
                        );
                }
                else if (op_.code == 10) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLteFirst(
                            args_,
                            blockNumber_
                        );
                }

                state_.stackIndex++;
            }
        }
    }

}