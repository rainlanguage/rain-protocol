// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { PrestigeUtil } from "./PrestigeUtil.sol";
import { IPrestige } from "./IPrestige.sol";

contract PrestigeByConstruction {
    IPrestige public prestige;
    uint256 public constructionBlock;

    constructor(IPrestige _prestige) public {
        prestige = _prestige;
        constructionBlock = block.number;
    }

    function isStatus(address account, IPrestige.Status status) public view returns (bool) {
        uint256 _statusReport = prestige.statusReport(account);
        uint256 _statusBlock = PrestigeUtil.statusBlock(_statusReport, status);
        return _statusBlock <= constructionBlock;
    }

    modifier onlyStatus(address account, IPrestige.Status status) {
        require(
            isStatus(account, status),
            "ERR_MIN_STATUS"
        );
        _;
    }
}