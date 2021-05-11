// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IPrestige } from "../IPrestige.sol";
import { PrestigeByConstruction } from "../PrestigeByConstruction.sol";

contract PrestigeByConstructionClaimTest is ERC20, PrestigeByConstruction {

    constructor(IPrestige _prestige) public PrestigeByConstruction(_prestige) ERC20("goldTkn", "GTKN") { }

    function claim() public onlyStatus(msg.sender, IPrestige.Status.GOLD) {
        super._mint(msg.sender, 100);
    }
}