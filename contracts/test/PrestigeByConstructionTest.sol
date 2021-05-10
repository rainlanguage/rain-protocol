// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { IPrestige } from "../IPrestige.sol";
import { PrestigeByConstruction } from "../PrestigeByConstruction.sol";

contract PrestigeByConstructionTest is PrestigeByConstruction {

    constructor(IPrestige _prestige) PrestigeByConstruction(_prestige) { }

    function unlimited() public view { }

    function ifNil() public view onlyStatus(msg.sender, IPrestige.Status.NIL) { }

    function ifCopper() public view onlyStatus(msg.sender, IPrestige.Status.COPPER) { }

    function ifBronze() public view onlyStatus(msg.sender, IPrestige.Status.BRONZE) { }

    function ifSilver() public view onlyStatus(msg.sender, IPrestige.Status.SILVER) { }

    function ifGold() public view onlyStatus(msg.sender, IPrestige.Status.GOLD) { }

    function ifPlatinum() public view onlyStatus(msg.sender, IPrestige.Status.PLATINUM) { }

    function ifDiamond() public view onlyStatus(msg.sender, IPrestige.Status.DIAMOND) { }

    function ifChad() public view onlyStatus(msg.sender, IPrestige.Status.CHAD) { }

    function ifJawad() public view onlyStatus(msg.sender, IPrestige.Status.JAWAD) { }
}