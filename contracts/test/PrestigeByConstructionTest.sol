// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "../IPrestige.sol";
import { PrestigeByConstruction } from "../PrestigeByConstruction.sol";

/**
 * An empty contract that facilitates tests enumerating behaviour of the modifiers at each status level
 */
contract PrestigeByConstructionTest is PrestigeByConstruction {


    constructor(IPrestige _prestige) public PrestigeByConstruction(_prestige) { } // solhint-disable-line no-empty-blocks


    function unlimited() external view { } // solhint-disable-line no-empty-blocks


    function ifNil()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.NIL)
    { } // solhint-disable-line no-empty-blocks


    function ifCopper()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.COPPER)
    { } // solhint-disable-line no-empty-blocks


    function ifBronze()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.BRONZE)
    { } // solhint-disable-line no-empty-blocks


    function ifSilver()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.SILVER)
    { } // solhint-disable-line no-empty-blocks


    function ifGold()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.GOLD)
    { } // solhint-disable-line no-empty-blocks


    function ifPlatinum()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.PLATINUM)
    { } // solhint-disable-line no-empty-blocks


    function ifDiamond()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.DIAMOND)
    { } // solhint-disable-line no-empty-blocks


    function ifChad()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.CHAD)
    { } // solhint-disable-line no-empty-blocks


    function ifJawad()
        external
        view
        onlyStatus(msg.sender, IPrestige.Status.JAWAD)
    { } // solhint-disable-line no-empty-blocks
}