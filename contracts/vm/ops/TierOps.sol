// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { State } from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

import "hardhat/console.sol";

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
    /// Opcode to tierwise select the best block lte a reference block.
    uint constant public SELECT_LTE = 5;
    /// Number of provided opcodes for `TierOps`.
    uint constant public OPS_LENGTH = 6;

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
                uint logic_ = opval_ >> 7;
                uint mode_ = (opval_ >> 5) & 0x3; // 00000011
                uint reportsLength_ = opval_ & 0x1F; // 00011111

                console.log("logic: %s", logic_);
                console.log("mode: %s", mode_);
                console.log("opval_: %s", opval_);
                console.log("len: %s", reportsLength_);

                state_.stackIndex -= reportsLength_ + 1;
                baseIndex_ = state_.stackIndex;

                uint blockNumber_ = state_.stack[baseIndex_];

                uint[] memory reports_ = new uint[](reportsLength_);
                for (uint a_ = 0; a_ < reportsLength_; a_++) {
                    reports_[a_] = state_.stack[baseIndex_ + a_ + 1];
                }

                state_.stack[baseIndex_] = TierwiseCombine.selectLte(
                    reports_,
                    blockNumber_,
                    logic_,
                    mode_
                );

                state_.stackIndex++;
            }
        }
    }

}