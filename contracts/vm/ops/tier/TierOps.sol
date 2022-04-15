// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";
import "../../../tier/libraries/TierReport.sol";
import "../../../tier/libraries/TierwiseCombine.sol";

/// @dev Opcode to call `report` on an `ITier` contract.
uint256 constant OPCODE_REPORT = 0;
/// @dev Opcode to calculate the tierwise diff of two reports.
uint256 constant OPCODE_SATURATING_DIFF = 1;
/// @dev Opcode to update the blocks over a range of tiers for a report.
uint256 constant OPCODE_UPDATE_BLOCKS_FOR_TIER_RANGE = 2;
/// @dev Opcode to tierwise select the best block lte a reference block.
uint256 constant OPCODE_SELECT_LTE = 3;
/// @dev Number of provided opcodes for `TierOps`.
uint256 constant TIER_OPS_LENGTH = 4;

/// @title TierOps
/// @notice RainVM opcode pack to operate on tier reports.
/// The opcodes all map to functions from `ITier` and associated libraries such
/// as `TierConstants`, `TierwiseCombine`, and `TierReport`. For each, the
/// order of consumed values on the stack corresponds to the order of arguments
/// to interface/library functions.
library TierOps {
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        internal
        pure
        returns (int256)
    {
        if (opcode_ == OPCODE_REPORT) {
            return -1;
        } else if (opcode_ < OPCODE_SATURATING_DIFF) {
            return 1;
        } else if (opcode_ < OPCODE_SELECT_LTE) {
            return -1;
        } else {
            uint256 reportsLength_ = operand_ & 0x1F; // & 00011111
            require(reportsLength_ > 0, "BAD_OPERAND");
            return 1 - int256(reportsLength_);
        }
    }

    // Stack the report returned by an `ITier` contract.
    // Top two stack vals are used as the address and `ITier` contract
    // to check against.
    function report(uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 tier_;
        uint256 account_;
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            tier_ := mload(location_)
            account_ := mload(stackTopLocation_)
        }
        uint256 report_ = ITier(address(uint160(tier_))).report(
            address(uint160(account_))
        );
        assembly {
            mstore(location_, report_)
        }
        return stackTopLocation_;
    }

    // Stack the tierwise saturating subtraction of two reports.
    // If the older report is newer than newer report the result will
    // be `0`, else a tierwise diff in blocks will be obtained.
    // The older and newer report are taken from the stack.
    function saturatingDiff(uint256, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
        uint256 location_;
        uint256 newerReport_;
        uint256 olderReport_;
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
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
        return stackTopLocation_;
    }

    // Stacks a report with updated blocks over tier range.
    // The start and end tier are taken from the low and high bits of
    // the `operand_` respectively.
    // The report to update and block number to update to are both
    // taken from the stack.
    function updateBlocksForTierRange(
        uint256 operand_,
        uint256 stackTopLocation_
    ) internal pure returns (uint256) {
        uint256 location_;
        uint256 report_;
        uint256 startTier_ = operand_ & 0x0f; // & 00001111
        uint256 endTier_ = (operand_ >> 4) & 0x0f; // & 00001111
        uint256 blockNumber_;

        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
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
        return stackTopLocation_;
    }

    // Stacks the result of a `selectLte` combinator.
    // All `selectLte` share the same stack and argument handling.
    // Takes the `logic_` and `mode_` from the `operand_` high bits.
    // `logic_` is the highest bit.
    // `mode_` is the 2 highest bits after `logic_`.
    // The other bits specify how many values to take from the stack
    // as reports to compare against each other and the block number.
    function selectLte(uint256 operand_, uint256 stackTopLocation_)
        internal
        pure
        returns (uint256)
    {
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
        return stackTopLocation_;
    }
}
