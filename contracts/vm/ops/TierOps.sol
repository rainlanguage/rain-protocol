// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State, Op } from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

library TierOps {

    uint constant internal REPORT = 0;
    uint constant internal NEVER = 1;
    uint constant internal ALWAYS = 2;
    uint constant internal DIFF = 3;
    uint constant internal UPDATE_BLOCKS_FOR_TIER_RANGE = 4;
    uint constant internal EVERY_LTE_MIN = 5;
    uint constant internal EVERY_LTE_MAX = 6;
    uint constant internal EVERY_LTE_FIRST = 7;
    uint constant internal ANY_LTE_MIN = 8;
    uint constant internal ANY_LTE_MAX = 9;
    uint constant internal ANY_LTE_FIRST = 10;
    uint constant internal OPS_LENGTH = 11;

    function applyOp(
        bytes memory,
        State memory state_,
        Op memory op_
    )
    internal
    view {
        unchecked {
            uint baseIndex_;
            if (op_.code == REPORT) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                state_.stack[baseIndex_] =
                    ITier(address(uint160(state_.stack[baseIndex_ + 1])))
                        .report(address(uint160(state_.stack[baseIndex_])));
                state_.stackIndex++;
            }
            else if (op_.code == NEVER) {
                state_.stack[state_.stackIndex] = TierReport.NEVER;
                state_.stackIndex++;
            }
            else if (op_.code == ALWAYS) {
                state_.stack[state_.stackIndex] = TierReport.ALWAYS;
                state_.stackIndex++;
            }
            else if (op_.code == DIFF) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                uint olderReport_ = state_.stack[baseIndex_];
                uint newerReport_ = state_.stack[baseIndex_ + 1];
                state_.stack[state_.stackIndex] = TierwiseCombine.diff(
                    olderReport_,
                    newerReport_
                );
                state_.stackIndex++;
            }
            else if (op_.code == UPDATE_BLOCKS_FOR_TIER_RANGE) {
                uint startTier_ = op_.val & 0x0f;
                uint endTier_ = (op_.val >> 4) & 0x0f;
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                uint blockNumber_ = state_.stack[baseIndex_];
                uint report_ = state_.stack[baseIndex_ + 1];
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
                uint[] memory args_ = new uint[](opval_);
                for (uint a_ = 0; a_ < opval_; a_++) {
                    args_[a_] = state_.stack[baseIndex_ + a_ + 1];
                }

                uint blockNumber_ = state_.stack[baseIndex_];

                if (op_.code == EVERY_LTE_MIN) {
                    state_.stack[baseIndex_]
                         = TierwiseCombine.everyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_MIN
                        );
                }
                else if (op_.code == EVERY_LTE_MAX) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.everyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_MAX
                        );
                }
                else if (op_.code == EVERY_LTE_FIRST) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.everyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_FIRST
                        );
                }
                else if (op_.code == ANY_LTE_MIN) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_MIN
                        );
                }
                else if (op_.code == ANY_LTE_MAX) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_MAX
                        );
                }
                else if (op_.code == ANY_LTE_FIRST) {
                    state_.stack[baseIndex_]
                        = TierwiseCombine.anyLte(
                            args_,
                            blockNumber_,
                            TierwiseCombine.MODE_FIRST
                        );
                }

                state_.stackIndex++;
            }
        }
    }

}