// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";
import "../../tier/libraries/TierReport.sol";
import "../../tier/libraries/TierwiseCombine.sol";

/// @title TierOps
/// @notice RainVM opcode pack to operate on tier reports.
library TierOps {
    /// Opcode to call `report` on an `ITier` contract.
    uint256 private constant REPORT = 0;
    /// Opcode to stack a report that has never been held for all tiers.
    uint256 private constant NEVER = 1;
    /// Opcode to stack a report that has always been held for all tiers.
    uint256 private constant ALWAYS = 2;
    /// Opcode to calculate the tierwise diff of two reports.
    uint256 private constant SATURATING_DIFF = 3;
    /// Opcode to update the blocks over a range of tiers for a report.
    uint256 private constant UPDATE_BLOCKS_FOR_TIER_RANGE = 4;
    /// Opcode to tierwise select the best block lte a reference block.
    uint256 private constant SELECT_LTE = 5;
    /// Number of provided opcodes for `TierOps`.
    uint256 internal constant OPS_LENGTH = 6;

    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        internal
        pure
        returns (int256)
    {
        if (opcode_ == REPORT) {
            return -1;
        } else if (opcode_ < SATURATING_DIFF) {
            return 1;
        } else if (opcode_ < SELECT_LTE) {
            return -1;
        } else {
            uint256 reportsLength_ = operand_ & 0x1F; // & 00011111
            require(reportsLength_ > 0, "BAD_OPERAND");
            return 1 - int(reportsLength_);
        }
    }

    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal view returns (uint256) {
        unchecked {
            // Stack the report returned by an `ITier` contract.
            // Top two stack vals are used as the address and `ITier` contract
            // to check against.
            if (opcode_ == REPORT) {
                uint256 location_;
                uint256 tier_;
                uint256 account_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x40)
                    stackTopLocation_ := add(location_, 0x20)
                    tier_ := mload(location_)
                    account_ := mload(stackTopLocation_)
                }
                uint256 report_ = ITier(address(uint160(tier_))).report(
                    address(uint160(account_))
                );
                assembly {
                    mstore(location_, report_)
                }
            }
            // Stack a report that has never been held at any tier.
            else if (opcode_ == NEVER) {
                uint256 never_ = TierConstants.NEVER_REPORT;
                assembly {
                    mstore(stackTopLocation_, never_)
                    stackTopLocation_ := add(stackTopLocation_, 0x20)
                }
            }
            // Stack a report that has always been held at every tier.
            else if (opcode_ == ALWAYS) {
                uint256 always_ = TierConstants.ALWAYS;
                assembly {
                    mstore(stackTopLocation_, always_)
                    stackTopLocation_ := add(stackTopLocation_, 0x20)
                }
            }
            // Stack the tierwise saturating subtraction of two reports.
            // If the older report is newer than newer report the result will
            // be `0`, else a tierwise diff in blocks will be obtained.
            // The older and newer report are taken from the stack.
            else if (opcode_ == SATURATING_DIFF) {
                uint256 location_;
                uint256 newerReport_;
                uint256 olderReport_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x40)
                    stackTopLocation_ := add(location_, 0x20)
                    newerReport_ := mload(location_)
                    olderReport_ := mload(stackTopLocation_)
                }
                uint256 result_ = TierwiseCombine.saturatingSub(
                    newerReport_,
                    olderReport_
                );
                assembly {
                    mstore(location_, result_)
                }
            }
            // Stacks a report with updated blocks over tier range.
            // The start and end tier are taken from the low and high bits of
            // the `operand_` respectively.
            // The block number to update to and the report to update over are
            // both taken from the stack.
            else if (opcode_ == UPDATE_BLOCKS_FOR_TIER_RANGE) {
                uint256 location_;
                uint256 report_;
                uint256 startTier_ = operand_ & 0x0f; // & 00001111
                uint256 endTier_ = (operand_ >> 4) & 0x0f; // & 00001111
                uint256 blockNumber_;

                assembly {
                    location_ := sub(stackTopLocation_, 0x40)
                    stackTopLocation_ := add(location_, 0x20)
                    report_ := mload(location_)
                    blockNumber_ := mload(stackTopLocation_)
                }

                uint256 result_ = TierReport.updateBlocksForTierRange(
                    report_,
                    startTier_,
                    endTier_,
                    blockNumber_
                );

                assembly {
                    mstore(location_, result_)
                }
            }
            // Stacks the result of a `selectLte` combinator.
            // All `selectLte` share the same stack and argument handling.
            // In the future these may be combined into a single opcode, taking
            // the `logic_` and `mode_` from the `operand_` high bits.
            else if (opcode_ == SELECT_LTE) {
                uint256 logic_ = operand_ >> 7;
                uint256 mode_ = (operand_ >> 5) & 0x3; // & 00000011
                uint256 reportsLength_ = operand_ & 0x1F; // & 00011111

                uint256 location_;
                uint256[] memory reports_ = new uint256[](reportsLength_);
                uint256 blockNumber_;
                assembly {
                    location_ := sub(
                        stackTopLocation_,
                        mul(add(reportsLength_, 1), 0x20)
                    )
                    let maxCursor_ := add(location_, mul(reportsLength_, 0x20))
                    for {
                        let cursor_ := location_
                        let i_ := 0
                    } lt(cursor_, maxCursor_) {
                        cursor_ := add(cursor_, 0x20)
                        i_ := add(i_, 0x20)
                    } {
                        mstore(add(reports_, add(0x20, i_)), mload(cursor_))
                    }
                    blockNumber_ := mload(maxCursor_)
                }

                uint256 result_ = TierwiseCombine.selectLte(
                    reports_,
                    blockNumber_,
                    logic_,
                    mode_
                );
                assembly {
                    mstore(location_, result_)
                    stackTopLocation_ := add(location_, 0x20)
                }
            }
            return stackTopLocation_;
        }
    }
}
