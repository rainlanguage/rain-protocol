// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

/// @title TierOps
/// @notice RainVM opcode pack to operate on tier reports.
library TierOps {

    /// Opcode to call `report` on an `ITier` contract.
    uint constant public REPORT = 0;
    /// Opcode to stack a report that has never been held for all tiers.
    uint constant public NEVER = 1;
    /// Opcode to stack a report that has always been held for all tiers.
    uint constant public ALWAYS = 2;
    /// Opcode to calculate the tierwise diff of two reports.
    uint constant public SATURATING_DIFF = 3;
    /// Opcode to update the blocks over a range of tiers for a report.
    uint constant public UPDATE_BLOCKS_FOR_TIER_RANGE = 4;
    /// Opcode to tierwise select the min block if every block is lte a val.
    uint constant public EVERY_LTE_MIN = 5;
    /// Opcode to tierwise select the max block if every block is lte a val.
    uint constant public EVERY_LTE_MAX = 6;
    /// Opcode to tierwise select the first block if every block is lte a val.
    uint constant public EVERY_LTE_FIRST = 7;
    /// Opcode to tierwise select the min block if any block is lte a val.
    uint constant public ANY_LTE_MIN = 8;
    /// Opcode to tierwise select the max block if any block is lte a val.
    uint constant public ANY_LTE_MAX = 9;
    /// Opcode to tierwise select the first block if any block is lte a val.
    uint constant public ANY_LTE_FIRST = 10;
    /// Number of provided opcodes for `TierOps`.
    uint constant public OPS_LENGTH = 11;

    function applyOp(
        bytes memory,
        State memory state_,
        uint opcode_,
        uint opval_
    )
    internal
    view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");
            uint baseIndex_;
            // Stack the report returned by an `ITier` contract.
            // Top two stack vals are used as the address and `ITier` contract
            // to check against.
            if (opcode_ == REPORT) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                state_.stack[baseIndex_] =
                    ITier(address(uint160(state_.stack[baseIndex_ + 1])))
                        .report(address(uint160(state_.stack[baseIndex_])));
                state_.stackIndex++;
            }
            // Stack a report that has never been held at any tier.
            else if (opcode_ == NEVER) {
                state_.stack[state_.stackIndex] = TierReport.NEVER;
                state_.stackIndex++;
            }
            // Stack a report that has always been held at every tier.
            else if (opcode_ == ALWAYS) {
                state_.stack[state_.stackIndex] = TierReport.ALWAYS;
                state_.stackIndex++;
            }
            // Stack the tierwise saturating subtraction of two reports.
            // If the older report is newer than newer report the result will
            // be `0`, else a tierwise diff in blocks will be obtained.
            // The older and newer report are taken from the stack.
            else if (opcode_ == SATURATING_DIFF) {
                state_.stackIndex -= 2;
                baseIndex_ = state_.stackIndex;
                uint olderReport_ = state_.stack[baseIndex_];
                uint newerReport_ = state_.stack[baseIndex_ + 1];
                state_.stack[state_.stackIndex]
                    = TierwiseCombine.saturatingSub(
                        olderReport_,
                        newerReport_
                    );
                state_.stackIndex++;
            }
            // Stacks a report with updated blocks over tier range.
            // The start and end tier are taken from the low and high bits of
            // the `opval_` respectively.
            // The block number to update to and the report to update over are
            // both taken from the stack.
            else if (opcode_ == UPDATE_BLOCKS_FOR_TIER_RANGE) {
                uint startTier_ = opval_ & 0x0f;
                uint endTier_ = (opval_ >> 4) & 0x0f;
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
            // Stacks the result of a `selectLte` combinator.
            // All `selectLte` share the same stack and argument handling.
            // In the future these may be combined into a single opcode, taking
            // the `logic_` and `mode_` from the `opval_` high bits.
            else {
                state_.stackIndex -= opval_ + 1;
                baseIndex_ = state_.stackIndex;
                uint[] memory args_ = new uint[](opval_);
                for (uint a_ = 0; a_ < opval_; a_++) {
                    args_[a_] = state_.stack[baseIndex_ + a_ + 1];
                }

                uint blockNumber_ = state_.stack[baseIndex_];

                uint logic_;
                uint mode_;

                if (opcode_ == EVERY_LTE_MIN) {
                    logic_ = TierwiseCombine.LOGIC_EVERY;
                    mode_ = TierwiseCombine.MODE_MIN;
                }
                else if (opcode_ == EVERY_LTE_MAX) {
                    logic_ = TierwiseCombine.LOGIC_EVERY;
                    mode_ = TierwiseCombine.MODE_MAX;
                }
                else if (opcode_ == EVERY_LTE_FIRST) {
                    logic_ = TierwiseCombine.LOGIC_EVERY;
                    mode_ = TierwiseCombine.MODE_FIRST;
                }
                else if (opcode_ == ANY_LTE_MIN) {
                    logic_ = TierwiseCombine.LOGIC_ANY;
                    mode_ = TierwiseCombine.MODE_MIN;
                }
                else if (opcode_ == ANY_LTE_MAX) {
                    logic_ = TierwiseCombine.LOGIC_ANY;
                    mode_ = TierwiseCombine.MODE_MAX;
                }
                else if (opcode_ == ANY_LTE_FIRST) {
                    logic_ = TierwiseCombine.LOGIC_ANY;
                    mode_ = TierwiseCombine.MODE_FIRST;
                }

                state_.stack[baseIndex_] = TierwiseCombine.selectLte(
                    args_,
                    blockNumber_,
                    logic_,
                    mode_
                );

                state_.stackIndex++;
            }
        }
    }

}