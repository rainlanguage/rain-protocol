// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {TierReport} from "../../contracts/tier/libraries/TierReport.sol";
import {TierConstants} from "../../contracts/tier/libraries/TierConstants.sol";
import {TierReportTest} from "../../contracts/test/tier/libraries/TierReport/TierReportTest.sol";

/// @title TierReportEchidna
/// Wrapper around the `TierReport` library for echidna fuzz testing.
contract TierReportEchidna {
    TierReportTest private _tierReportTest;

    event AssertionFailed();

    constructor() {
        // Usin an instantiation to test
        _tierReportTest = new TierReportTest();
    }

    function TierAtTimeFromReport(
        uint256 _report,
        uint256 _timestamp
    ) external view {
        // Get the tier from library with values on storage
        uint256 tierObtained = _tierReportTest.tierAtTimeFromReport(
            _report,
            _timestamp
        );

        // Get each tier level from the report
        uint32[8] memory _tiers = _splitReport(_report);

        // Using tierCalculated
        uint256 tierCalculated;
        for (tierCalculated = 0; tierCalculated < 8; tierCalculated++) {
            if (_tiers[tierCalculated] > _timestamp) {
                break;
            }
        }

        assert(tierCalculated == tierObtained);
    }

    function ReportTimeForTier(uint256 _report, uint256 _tier) external {
        try _tierReportTest.reportTimeForTier(_report, _tier) returns (
            uint256 timeObtained
        ) {
            // Get each tier level from the report
            uint32[8] memory _tiers = _splitReport(_report);

            // The expected value
            uint256 timeExpected = _tier == 0 ? 0 : _tiers[_tier - 1];

            assert(timeObtained == timeExpected);
        } catch {
            _checkTier(_tier);
        }
    }

    function TruncateTiersAbove(uint256 _report, uint256 _tier) external {
        try _tierReportTest.truncateTiersAbove(_report, _tier) returns (
            uint256 truncatedReport
        ) {
            _checkTruncateTiersAbove(truncatedReport, _report, _tier);
        } catch {
            _checkTier(_tier);
        }
    }

    function UpdateTimeAtTier(
        uint256 _report,
        uint256 _tier,
        uint32 _timestamp
    ) external {
        try
            _tierReportTest.updateTimeAtTier(_report, _tier, _timestamp)
        returns (uint256 reportCalculated) {
            // Check the result
            _checkUpdateTimeAtTier(
                reportCalculated,
                _report,
                _tier,
                _timestamp
            );
        } catch {
            _checkTier(_tier);
        }
    }

    function UpdateTimesForTierRange(
        uint256 _report,
        uint256 _startTier,
        uint256 _endTier,
        uint32 _timestamp
    ) external {
        try
            _tierReportTest.updateTimesForTierRange(
                _report,
                _startTier,
                _endTier,
                _timestamp
            )
        returns (uint256 reportCalculated) {
            // Check the result
            _checkUpdateTimesForTierRange(
                reportCalculated,
                _report,
                _startTier,
                _endTier,
                _timestamp
            );
        } catch {
            _checkTier(_endTier);
        }
    }

    function UpdateReportWithTierAtTime(
        uint256 _report,
        uint256 _startTier,
        uint256 _endTier,
        uint32 _timestamp
    ) external {
        try
            _tierReportTest.updateReportWithTierAtTime(
                _report,
                _startTier,
                _endTier,
                _timestamp
            )
        returns (uint256 newReport) {
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
        } catch {
            _checkTier(_endTier);
        }
    }

    // Helper function to replicate how the tiers are splitted
    function _splitReport(
        uint256 report_
    ) private pure returns (uint32[8] memory tiers_) {
        // The tiers are splitted by each 32bits from the report
        for (uint256 i = 0; i < 8; i++) {
            tiers_[i] = uint32(uint256(report_ >> (i * 32)));
        }
    }

    // Helper function to check the input tier in the try/catch workflow.
    //  - If the tier is invalidad (greater than 8), then the tx will revert as expected.
    //  - If the tier is valid, something else happened.
    function _checkTier(uint256 _tier) private {
        if (_tier <= 8) {
            emit AssertionFailed();
        }
    }

    // Helper function to check the result from TruncateTierAbove using asserts
    function _checkTruncateTiersAbove(
        uint256 newReport_,
        uint256 originalReport_,
        uint256 tierTarget_
    ) private pure {
        if (tierTarget_ == 0) {
            // All levels should be modified to 0xffffffff
            assert(newReport_ == TierConstants.NEVER_REPORT);
        }
        tierTarget_ -= 1;

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = _splitReport(newReport_);
        uint32[8] memory originalTiers_ = _splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i <= tierTarget_) {
                // From the desired tier and below it should be the same
                assert(newTiers_[i] == originalTiers_[i]); // The level was modified wrongly
            } else {
                // Above the desited tier should change to NEVER_TIME (0xffffffff)
                assert(newTiers_[i] == TierConstants.NEVER_TIME); // The level was not modified to 0xffffffff
            }
        }
    }

    // Helper function to check the result from UpdateTimeAtTier using asserts
    function _checkUpdateTimeAtTier(
        uint256 reportCalculated_,
        uint256 originalReport_,
        uint256 tierTarget_,
        uint32 timestamp_
    ) private pure {
        if (tierTarget_ == 8) {
            // If tier desired is tier 8, the report will not get any change
            assert(reportCalculated_ == originalReport_);
        }

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = _splitReport(reportCalculated_);
        uint32[8] memory originalTiers_ = _splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i == tierTarget_) {
                assert(newTiers_[i] == timestamp_); // The tier was not correctly updated with the time
            } else {
                assert(newTiers_[i] == originalTiers_[i]); // The report was wrongly changed
            }
        }
    }

    function _checkUpdateTimesForTierRange(
        uint256 reportCalculated_,
        uint256 originalReport_,
        uint256 startTier_,
        uint256 endTier_,
        uint32 timestamp_
    ) private pure {
        if (endTier_ <= startTier_) {
            // If the end status is equal or less than the start tier, the report does not change
            assert(reportCalculated_ == originalReport_);
        }

        // Split the reports to compare each one
        uint32[8] memory newTiers_ = _splitReport(reportCalculated_);
        uint32[8] memory originalTiers_ = _splitReport(originalReport_);

        for (uint256 i = 0; i < 8; i++) {
            if (i >= startTier_ && i + 1 <= endTier_) {
                assert(newTiers_[i] == timestamp_); // The tier was not correctly updated with the time
            } else {
                assert(newTiers_[i] == originalTiers_[i]); // The report was wrongly changed
            }
        }
    }
}
