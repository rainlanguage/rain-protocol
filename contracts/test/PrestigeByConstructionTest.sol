// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { IPrestige } from "../IPrestige.sol";
import { PrestigeByConstruction } from "../PrestigeByConstruction.sol";

contract PrestigeByConstructionTest is PrestigeByConstruction {

    constructor(IPrestige _prestige) public PrestigeByConstruction(_prestige) { } // solhint-disable-line no-empty-blocks

    function unlimited() public view { } // solhint-disable-line no-empty-blocks

    function ifNil() public view onlyStatus(msg.sender, IPrestige.Status.NIL) { } // solhint-disable-line no-empty-blocks

    function ifCopper() public view onlyStatus(msg.sender, IPrestige.Status.COPPER) { } // solhint-disable-line no-empty-blocks

    function ifBronze() public view onlyStatus(msg.sender, IPrestige.Status.BRONZE) { } // solhint-disable-line no-empty-blocks

    function ifSilver() public view onlyStatus(msg.sender, IPrestige.Status.SILVER) { } // solhint-disable-line no-empty-blocks

    function ifGold() public view onlyStatus(msg.sender, IPrestige.Status.GOLD) { } // solhint-disable-line no-empty-blocks

    function ifPlatinum() public view onlyStatus(msg.sender, IPrestige.Status.PLATINUM) { } // solhint-disable-line no-empty-blocks

    function ifDiamond() public view onlyStatus(msg.sender, IPrestige.Status.DIAMOND) { } // solhint-disable-line no-empty-blocks

    function ifChad() public view onlyStatus(msg.sender, IPrestige.Status.CHAD) { } // solhint-disable-line no-empty-blocks

    function ifJawad() public view onlyStatus(msg.sender, IPrestige.Status.JAWAD) { } // solhint-disable-line no-empty-blocks
}