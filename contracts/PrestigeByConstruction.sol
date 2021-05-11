// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { PrestigeUtil } from "./PrestigeUtil.sol";
import { IPrestige } from "./IPrestige.sol";

import { console } from "hardhat/console.sol";

contract PrestigeByConstruction {
    IPrestige public prestige;
    uint256 public constructionBlock;

    constructor(IPrestige _prestige) public {
        prestige = _prestige;
        constructionBlock = block.number;
    }


    /// Modifier that restricts access to functions depending on the status required by the function
    /// @param account - Account status to be queried.
    /// @param status - Status to compare with the account status
    /// @return boolean that indicates whether it is in the queried state or not
    function isStatus(address account, IPrestige.Status status) 
        public
        view
        returns (bool) 
    {
        uint256 _statusReport = prestige.statusReport(account);
        uint256 _statusBlock = PrestigeUtil.statusBlock(_statusReport, status);
        console.log(
            "PrestigeByConstruction: isStatus: %s %s %s",
            _statusReport,
            _statusBlock,
            constructionBlock
        );
        return _statusBlock <= constructionBlock;
    }


    /// Modifier that restricts access to functions depending on the status required by the function
    /// @param account - Account status to be queried.
    /// @param status - Status required by the restricted function.
    modifier onlyStatus(address account, IPrestige.Status status) {
        require(
            isStatus(account, status),
            "ERR_MIN_STATUS"
        );
        _;
    }
}