// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Cooldown } from "../cooldown/Cooldown.sol";

contract CooldownSize is Cooldown {
    constructor () Cooldown(100) { } //solhint-disable-line no-empty-blocks
}