// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../tier/ITierV2.sol";
import "hardhat/console.sol";

contract ReportOMeter {

    uint private val;

    event Report(uint report);

    function gaugeReport(address tierContract_, address account_, uint[] calldata context_) external {
        val = 1;

        uint a_ = gasleft();
        uint report_ = ITierV2(tierContract_).report(account_, context_);
        uint b_ = gasleft();

        console.log("report cost: %s", a_ - b_);

        emit Report(report_);
    }

    function gaugeReportTimeForTier(address tierContract_, address account_, uint tier_, uint[] calldata context_) external {
        val = 1;

        uint a_ = gasleft();
        uint report_ = ITierV2(tierContract_).reportTimeForTier(account_, tier_, context_);
        uint b_ = gasleft();

        console.log("report time cost: %s", a_ - b_);

        emit Report(report_);
    }

}