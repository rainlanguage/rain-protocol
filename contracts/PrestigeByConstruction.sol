// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { PrestigeUtil } from "./PrestigeUtil.sol";
import { IPrestige } from "./IPrestige.sol";

contract PrestigeByConstruction {
    IPrestige public prestige;
    uint256 public constructionBlock;

    constructor(IPrestige _prestige) {
        prestige = _prestige;
        constructionBlock = block.number;
    }

    modifier onlyStatus(address account, IPrestige.Status status) {
        require(
            PrestigeUtil.statusBlock(prestige.statusReport(account), status) <= constructionBlock,
            "ERR_BAD_STATUS"
        );
        _;
    }
}