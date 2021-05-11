// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { PrestigeUtil } from "./PrestigeUtil.sol";
import { IPrestige } from "./IPrestige.sol";

/**
 * Enforces prestige levels by contract contruction block.
 * The construction block is compared against the blocks returned by `statusReport`.
 * The `IPrestige` contract is paramaterised and set during construction.
 */
contract PrestigeByConstruction {
    IPrestige public prestige;
    uint256 public constructionBlock;

    constructor(IPrestige _prestige) public {
        prestige = _prestige;
        constructionBlock = block.number;
    }

    /**
     * Check if an account has held AT LEAST the given status according to `prestige` since construction.
     * The account MUST have held the status continuously from construction until the "current" state according to `statusReport`.
     * Note that `statusReport` PROBABLY is current as at the block this function is called but MAYBE NOT.
     * The `IPrestige` contract is free to manage status reports however makes sense to it.
     *
     * @param account Account to check status of.
     * @param status Minimum status level for the account.
     * @return True if the status is currently held.
     */
    function isStatus(address account, IPrestige.Status status)
        public
        view
        returns (bool)
    {
        uint256 _statusReport = prestige.statusReport(account);
        uint256 _statusBlock = PrestigeUtil.statusBlock(_statusReport, status);
        return _statusBlock <= constructionBlock;
    }

    /**
     * Modifier that restricts access to functions depending on the status required by the function.
     *
     * `isStatus` involves an external call to prestige.statusReport.
     * `require` happens AFTER the modified function to avoid rentrant `IPrestige` code.
     * Also `statusReport` from `IPrestige` is `view` so the compiler will error state modification.
     * https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks
     *
     * Do NOT use this to guard setting the status on an IPrestige contract.
     * The initial status would be checked AFTER it has already been modified which is unsafe.
     *
     * @param account Account to enforce status of.
     * @param status Minimum status level for the account.
     */
    modifier onlyStatus(address account, IPrestige.Status status) {
        _;
        require(
            isStatus(account, status),
            "ERR_MIN_STATUS"
        );
    }
}