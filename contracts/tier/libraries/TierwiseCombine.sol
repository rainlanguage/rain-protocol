// SPDX-License-Identifier: CAL

pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./TierReport.sol";
import "../../math/SaturatingMath.sol";

library TierwiseCombine {
    using Math for uint256;
    using SaturatingMath for uint256;

    uint constant private MAX_STEP = 256;

    uint constant internal LOGIC_EVERY = 0;

    uint constant internal MODE_MIN = 0;
    uint constant internal MODE_MAX = 1;
    uint constant internal MODE_FIRST = 2;

    /// Performs a tierwise diff of two reports.
    /// Intepret as "# of blocks older report was held before newer report".
    /// If older report is in fact newer then `0` will be returned.
    /// i.e. the diff cannot be negative, older report as simply spent 0 blocks
    /// existing before newer report, if it is in truth the newer report.
    function diff(
        uint olderReport_,
        uint newerReport_
    ) internal pure returns (uint) {
        unchecked {
            uint ret_;
            for (uint tier_ = 1; tier_ <= 8; tier_++) {
                uint olderBlock_ = TierReport.tierBlock(
                    olderReport_,
                    tier_
                );
                uint newerBlock_ = TierReport.tierBlock(
                    newerReport_,
                    tier_
                );
                uint diff_ = newerBlock_.saturatingSub(olderBlock_);
                ret_ = TierReport
                    .updateBlockAtTier(
                        ret_,
                        tier_ - 1,
                        diff_
                    );
            }
            return ret_;
        }
    }

    function selectLte(
        uint[] memory reports_,
        uint blockNumber_,
        uint logic_,
        uint mode_
    ) internal pure returns (uint) {
        unchecked {
            uint ret_;
            uint accumulator_;
            uint block_;
            uint length_ = reports_.length;
            for (uint tier_ = 1; tier_ <= 8; tier_++) {
                for (uint i_ = 0; i_ < length_; i_++) {
                    block_ = TierReport.tierBlock(reports_[i_], tier_);

                    // Initialize the accumulator.
                    if (i_ == 0) {
                        if (mode_ == MODE_MIN) {
                            accumulator_ = TierReport.NEVER;
                        }
                        else if (mode_ == MODE_MAX) {
                            accumulator_ = 0;
                        }
                        else if (mode_ == MODE_FIRST) {
                            accumulator_ = block_;
                        }
                    }

                    // Test the lte constraint.
                    if (block_ > blockNumber_) {
                        accumulator_ = TierReport.NEVER;
                        // Can short circuit for an "every" check.
                        break;
                    }

                    // Min and max need to compare current value against the
                    // accumulator.
                    if (mode_ == MODE_MIN) {
                        accumulator_ = block_.min(accumulator_);
                    }
                    else if (mode_ == MODE_MAX) {
                        accumulator_ = block_.max(accumulator_);
                    }
                }
                ret_ = TierReport.updateBlockAtTier(
                    ret_,
                    tier_ - 1,
                    accumulator_
                );
            }
            return ret_;
        }

    }

    function everyLte(
        uint[] memory reports_,
        uint blockNumber_,
        uint mode_
    ) internal pure returns (uint256) {
        return selectLte(reports_, blockNumber_, LOGIC_EVERY, mode_);
        // unchecked {
        //     uint ret_;
        //     uint accumulator_;
        //     uint block_;
        //     uint length_ = reports_.length;
        //     for (uint tier_ = 1; tier_ <= 8; tier_++) {
        //         for (uint i_ = 0; i_ < length_; i_++) {
        //             block_ = TierReport.tierBlock(reports_[i_], tier_);

        //             // Initialize the accumulator.
        //             if (i_ == 0) {
        //                 if (mode_ == MODE_MIN) {
        //                     accumulator_ = TierReport.NEVER;
        //                 }
        //                 else if (mode_ == MODE_MAX) {
        //                     accumulator_ = 0;
        //                 }
        //                 else if (mode_ == MODE_FIRST) {
        //                     accumulator_ = block_;
        //                 }
        //             }

        //             // Test the lte constraint.
        //             if (block_ > blockNumber_) {
        //                 accumulator_ = TierReport.NEVER;
        //                 // Can short circuit for an "every" check.
        //                 break;
        //             }

        //             // Min and max need to compare current value against the
        //             // accumulator.
        //             if (mode_ == MODE_MIN) {
        //                 accumulator_ = block_.min(accumulator_);
        //             }
        //             else if (mode_ == MODE_MAX) {
        //                 accumulator_ = block_.max(accumulator_);
        //             }
        //         }
        //         ret_ = TierReport.updateBlockAtTier(
        //             ret_,
        //             tier_ - 1,
        //             accumulator_
        //         );
        //     }
        //     return ret_;
        // }
    }

    function anyLte(uint[] memory reports_, uint blockNumber_, uint mode_)
        internal
        pure
        returns (uint)
    {
        unchecked {
            uint ret_;
            uint accumulator_;
            uint block_;
            bool anyTrue_;
            uint length_ = reports_.length;
            for (uint tier_ = 1; tier_ <= 8; tier_++) {
                anyTrue_ = false;
                for (uint i_ = 0; i_ < length_; i_++) {
                    block_ = TierReport.tierBlock(reports_[i_], tier_);

                    // Initialize accumulator on first pass.
                    if (i_ == 0) {
                        if (mode_ == MODE_MIN) {
                            accumulator_ = TierReport.NEVER;
                        }
                        else if (mode_ == MODE_MAX) {
                            accumulator_ = 0;
                        }
                        else if (mode_ == MODE_FIRST) {
                            accumulator_ = block_;
                        }
                    }

                    // Test the lte constraint and compare values against the
                    // accumulator.
                    if (block_ <= blockNumber_) {
                        if (mode_ == MODE_MIN) {
                            accumulator_ = block_.min(accumulator_);
                        }
                        else if (mode_ == MODE_MAX) {
                            accumulator_ = block_.max(accumulator_);
                        }
                        else if (mode_ == MODE_FIRST && !anyTrue_) {
                            accumulator_ = block_;
                        }
                        anyTrue_ = true;
                    }
                }
                if (!anyTrue_) {
                    accumulator_ = TierReport.NEVER;
                }
                ret_ = TierReport.updateBlockAtTier(
                    ret_,
                    tier_ - 1,
                    accumulator_
                );
            }
            return ret_;
        }
    }

    // // IF __any__ block number is lte `blockNumber_`
    // // preserve the __minimum__ block number
    // // on a per-tier basis.
    // function anyLteMin(
    //     uint256[] memory reports_,
    //     uint256 blockNumber_
    // ) internal pure returns (uint256) {
    //     return anyLte(reports_, blockNumber_, MODE_MIN);
    // }

    // // IF __any__ block number is lte `blockNumber_`
    // // preserve the __maximum__ block number
    // // on a per-tier basis.
    // function anyLteMax(
    //     uint256[] memory reports_,
    //     uint256 blockNumber_
    // ) internal pure returns (uint256) {
    //     return anyLte(reports_, blockNumber_, MODE_MAX);
    // }

    // // IF __any__ block number is lte `blockNumber_`
    // // preserve the __first__ block number in `reports_` order
    // // on a per-tier basis.
    // function anyLteFirst(
    //     uint256[] memory reports_,
    //     uint256 blockNumber_
    // ) internal pure returns (uint256) {
    //     return anyLte(reports_, blockNumber_, MODE_FIRST);
    // }
}