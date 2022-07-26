// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {TierReport} from "../../tier/libraries/TierReport.sol";
import {TierConstants} from "../../tier/libraries/TierConstants.sol";

/// @title TierReport_Echidna
/// Wrapper around the `TierReport` library for echidna fuzz testing.
contract TierReport_Echidna {
    // Arbitrary report setted by Echidna
    uint256 private _report;
    // Tiers levels from the report setted by Echidna
    uint32[8] private _tiers;

    // Arbitrary _timestamp setted by Echidna
    uint32 private _timestamp;

    // Arbitrary VALID tier level setted by Echidna
    uint256 private _tier;

    // Arbitrary INVALID tier level setted by Echidna
    uint256 private _invalidTier = 9; // By defaul > 8

    uint256 private _startTier;
    uint256 private _endTier;

    // Helper function to replicate how the tiers are splitted
    function splitReport(uint256 report_)
        private
        pure
        returns (uint32[8] memory tiers_)
    {
        // The tiers are splitted by each 32bits from the report
        for (uint256 i = 0; i < 8; i++) {
            tiers_[i] = uint32(uint256(report_ >> (i * 32)));
        }
    }

    // Allow echidna to set report and separate the report into the 8 tier levels
    function setReport(uint256 report_) public {
        _report = report_;
        _tiers = splitReport(report_);
    }

    // Allow echidna to set a timestmap to evaluate
    function setTimestamp(uint32 timestamp_) public {
        _timestamp = timestamp_;
    }

    // Allow echidna to set a VALID tier to evaluate
    function setTier(uint256 tier_) public {
        require(tier_ <= 8, "It have to be a valid tier");
        _tier = tier_;
    }

    // Allow echidna to set a INVALID tier to evaluate
    function setInvalidTier(uint256 invalidTier_) public {
        require(invalidTier_ > 8, "It have to be an invalid tier");
        _invalidTier = invalidTier_;
    }

    // Allow echidna to set start and end tiers values tot est
    function setStartEndTier(uint256 startTier_, uint256 endTier_) public {
        // startTier_ can be any number
        require(endTier_ <= 8, "It have to be a valid tier");

        _startTier = startTier_;
        _endTier = endTier_;
    }

    // Maxtier to be reverted with invalid tiers - Test fuzzed with Echidna
    // The functions with the modifier (like reportTimeForTier) should rever with invalid tiers
    function echidna_revert_maxTier() external view returns (bool) {
        // Get the timestamp from library with values on storage
        uint256 timestampObtained = TierReport.reportTimeForTier(
            _report,
            _invalidTier
        );

        uint256 timestampCalculated = _invalidTier == 0
            ? 0
            : _tiers[_invalidTier - 1];

        return timestampObtained == timestampCalculated;
    }

    // TierAtTimeFromReport to be tested fuzzed with Echidna
    function echidna_tierAtTimeFromReport() external view returns (bool) {
        // Get the tier from library with values on storage
        uint256 tierObtained = TierReport.tierAtTimeFromReport(
            _report,
            _timestamp
        );

        // Using tierCalculated
        uint256 tierCalculated;
        for (tierCalculated = 0; tierCalculated < 8; tierCalculated++) {
            if (_tiers[tierCalculated] > _timestamp) {
                break;
            }
        }

        return tierCalculated == tierObtained;
    }

    // ReportTimeForTier to be tested fuzzed with Echidna
    // The tier should be a valid valu [0-8] to represetn a tier.
    // If desired tier does not fit(major to 8), reportTimeForTier should revert. Check `echidna_revert_reportTimeForTier`.
    function echidna_reportTimeForTier() external view returns (bool) {
        // Get the timestamp from library with values on storage
        uint256 timestampObtained = TierReport.reportTimeForTier(
            _report,
            _tier
        );

        uint256 timestampCalculated = _tier == 0 ? 0 : _tiers[_tier - 1];

        return timestampObtained == timestampCalculated;
    }

    // TruncateTiersAbove to be tested fuzzed with Echidna
    function echidna_truncateTiersAbove() external view returns (bool) {
        // Get the truncated from library with values on storage
        uint256 truncatedReport = TierReport.truncateTiersAbove(_report, _tier);

        return _checkTruncateTiersAbove(truncatedReport, _report, _tier);
    }

    // UpdateTimeAtTier to be tested fuzzed with Echidna
    function echidna_updateTimeAtTier() external view returns (bool) {
        // Get the new report from library with values on storage
        uint256 newReport = TierReport.updateTimeAtTier(
            _report,
            _tier,
            _timestamp
        );

        return _checkUpdateTimeAtTier(newReport, _report, _tier, _timestamp);
    }

    // UpdateTimesForTierRange to be tested fuzzed with Echidna
    function echidna_updateTimesForTierRange() external view returns (bool) {
        // Get the new report from library with values on storage
        uint256 newReport = TierReport.updateTimesForTierRange(
            _report,
            _startTier,
            _endTier,
            _timestamp
        );

        return
            _checkUpdateTimesForTierRange(
                newReport,
                _report,
                _startTier,
                _endTier,
                _timestamp
            );
    }

    // UpdateReportWithTierAtTime to be tested fuzzed with Echidna
    function echidna_updateReportWithTierAtTime() external view returns (bool) {
        // Get the new report from library with values on storage
        uint256 newReport = TierReport.updateReportWithTierAtTime(
            _report,
            _startTier,
            _endTier,
            _timestamp
        );

        if (_endTier < _startTier) {
            return _checkTruncateTiersAbove(newReport, _report, _endTier);
        } else {
            return
                _checkUpdateTimesForTierRange(
                    newReport,
                    _report,
                    _startTier,
                    _endTier,
                    _timestamp
                );
        }
    }

    function _checkTruncateTiersAbove(
        uint256 newReport_,
        uint256 originalReport_,
        uint256 tierTarget_
    ) private pure returns (bool) {
        if (tierTarget_ == 0) {
            // All levels should be modified to 0xffffffff
            return newReport_ == TierConstants.NEVER_REPORT;
        }
        tierTarget_ -= 1;

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = splitReport(newReport_);
        uint32[8] memory originalTiers_ = splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i <= tierTarget_) {
                // From the desired tier and below it should be the same
                require(
                    newTiers_[i] == originalTiers_[i],
                    "The level was modified wrongly"
                );
            } else {
                // Above the desited tier should change to NEVER_TIME (0xffffffff)
                require(
                    newTiers_[i] == TierConstants.NEVER_TIME,
                    "The level was not modified to 0xffffffff"
                );
            }
        }

        // If any rever happened, then the truncated is good
        return true;
    }

    function _checkUpdateTimeAtTier(
        uint256 newReport_,
        uint256 originalReport_,
        uint256 tierTarget_,
        uint32 timestamp_
    ) private pure returns (bool) {
        if (tierTarget_ == 8) {
            // If tier desired is tier 8, the report will not get any change
            return newReport_ == originalReport_;
        }

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = splitReport(newReport_);
        uint32[8] memory originalTiers_ = splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i == tierTarget_) {
                require(
                    newTiers_[i] == timestamp_,
                    "The tier was not correctly updated with the time"
                );
            } else {
                require(
                    newTiers_[i] == originalTiers_[i],
                    "The report was wrongly changed"
                );
            }
        }

        // If any rever happened, then the report was correctly updated
        return true;
    }

    function _checkUpdateTimesForTierRange(
        uint256 newReport_,
        uint256 originalReport_,
        // uint32[8] memory newTiers_,
        // uint32[8] memory originalTiers_,
        uint256 startTier_,
        uint256 endTier_,
        uint32 timestamp_
    ) private pure returns (bool) {
        if (endTier_ <= startTier_) {
            // If the end status is equal or less than the start tier, the report does not change
            return newReport_ == originalReport_;
        }

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = splitReport(newReport_);
        uint32[8] memory originalTiers_ = splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i >= startTier_ && i + 1 <= endTier_) {
                require(
                    newTiers_[i] == timestamp_,
                    "The tier was not correctly updated with the time"
                );
            } else {
                require(
                    newTiers_[i] == originalTiers_[i],
                    "The report was wrongly changed"
                );
            }
        }

        // If any rever happened, then the report was correctly updated
        return true;
    }
}
