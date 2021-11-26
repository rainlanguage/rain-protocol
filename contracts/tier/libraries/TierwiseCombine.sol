// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./TierReport.sol";

library TierwiseCombine {
    using Math for uint256;

    /// Performs a tierwise diff of two reports.
    /// Intepret as "# of blocks older report was held before newer report".
    /// If older report is in fact newer then `0` will be returned.
    /// i.e. the diff cannot be negative, older report as simply spent 0 blocks
    /// existing before newer report, if it is in truth the newer report.
    function diff(
        uint256 olderReport_,
        uint256 newerReport_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256 olderBlock_ = uint256(
                uint256(olderReport_ << 256 - step_ - 32) >> 256 - 32
            );
            uint256 newerBlock_ = uint256(
                uint256(newerReport_ << 256 - step_ - 32) >> 256 - 32
            );
            uint256 diff_ = newerBlock_ > olderBlock_
                ? newerBlock_ - olderBlock_ : 0;
            ret_ |= uint256(uint256(uint32(diff_)) << step_);
        }
        return ret_;
    }

    /// IF __every__ block number is lte `blockNumber_`
    /// preserve the __minimum__ block number
    /// on a per-tier basis.
    function everyLteMin(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_ = TierReport.NEVER;
            bool allTrue_ = true;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (allTrue_ && vals_[i_] <= blockNumber_) {
                    accumulator_ = vals_[i_].min(accumulator_);
                }
                else {
                    allTrue_ = false;
                    break;
                }
            }
            if (!allTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __maximum__ block number
    // on a per-tier basis.
    function everyLteMax(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_ = 0;
            bool allTrue_ = true;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (allTrue_ && vals_[i_] <= blockNumber_) {
                    accumulator_ = vals_[i_].max(accumulator_);
                }
                else {
                    allTrue_ = false;
                    break;
                }
            }
            if (!allTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function everyLteFirst(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_ = vals_[0];
            bool allTrue_ = true;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (vals_[i_] > blockNumber_) {
                    allTrue_ = false;
                    break;
                }
            }
            if (!allTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __minimum__ block number
    // on a per-tier basis.
    function anyLteMin(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_;
            bool anyTrue_ = false;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (vals_[i_] <= blockNumber_) {
                    accumulator_ = anyTrue_
                        ? vals_[i_].min(accumulator_) : vals_[i_];
                    anyTrue_ = true;
                }
            }
            if (!anyTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;

    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __maximum__ block number
    // on a per-tier basis.
    function anyLteMax(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_;
            bool anyTrue_ = false;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (vals_[i_] <= blockNumber_) {
                    accumulator_ = anyTrue_
                        ? vals_[i_].max(accumulator_) : vals_[i_];
                    anyTrue_ = true;
                }
            }
            if (!anyTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function anyLteFirst(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            uint256 accumulator_;
            bool anyTrue_ = false;
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                if (vals_[i_] <= blockNumber_ && !anyTrue_) {
                    accumulator_ = vals_[i_];
                    anyTrue_ = true;
                }
            }
            if (!anyTrue_) {
                accumulator_ = TierReport.NEVER;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }
}