pragma solidity ^0.6.12;

import "../Prestige.sol";
import "./PrestigeByConstructionClaimTest.sol";

contract MaliciousClaimPrestige is Prestige {
    function statusReport(address account) public override view returns(uint256) {
        // PrestigeByConstructionClaimTest(msg.sender).claim(account);
        return super.statusReport(account);
    }
}