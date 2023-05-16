// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "../../../tier/ITierV2.sol";
import "hardhat/console.sol";

contract ReportOMeter {
    uint256 private val;

    event Report(uint256 report);

    function gaugeReport(
        address tierContract_,
        address account_,
        uint256[] calldata context_
    ) external {
        val = 1;

        uint256 a_ = gasleft();
        uint256 report_ = ITierV2(tierContract_).report(account_, context_);
        uint256 b_ = gasleft();

        console.log("report cost: %s", a_ - b_);

        emit Report(report_);
    }

    function gaugeReportTimeForTier(
        address tierContract_,
        address account_,
        uint256 tier_,
        uint256[] calldata context_
    ) external {
        val = 1;

        uint256 a_ = gasleft();
        uint256 report_ = ITierV2(tierContract_).reportTimeForTier(
            account_,
            tier_,
            context_
        );
        uint256 b_ = gasleft();

        console.log("report time cost: %s", a_ - b_);

        emit Report(report_);
    }
}
