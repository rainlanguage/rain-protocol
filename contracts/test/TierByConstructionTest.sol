// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import { ITier } from "../tier/ITier.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";

/**
 * An empty contract that facilitates tests enumerating behaviour of the modifiers at each tier
 */
contract TierByConstructionTest is TierByConstruction {


    constructor(ITier _prestige) public TierByConstruction(_prestige) { } // solhint-disable-line no-empty-blocks


    function unlimited() external view { } // solhint-disable-line no-empty-blocks


    function ifZero()
        external
        view
        onlyTier(msg.sender, ITier.Tier.ZERO)
    { } // solhint-disable-line no-empty-blocks


    function ifOne()
        external
        view
        onlyTier(msg.sender, ITier.Tier.ONE)
    { } // solhint-disable-line no-empty-blocks


    function ifTwo()
        external
        view
        onlyTier(msg.sender, ITier.Tier.TWO)
    { } // solhint-disable-line no-empty-blocks


    function ifThree()
        external
        view
        onlyTier(msg.sender, ITier.Tier.THREE)
    { } // solhint-disable-line no-empty-blocks


    function ifFour()
        external
        view
        onlyTier(msg.sender, ITier.Tier.FOUR)
    { } // solhint-disable-line no-empty-blocks


    function ifFive()
        external
        view
        onlyTier(msg.sender, ITier.Tier.FIVE)
    { } // solhint-disable-line no-empty-blocks


    function ifSix()
        external
        view
        onlyTier(msg.sender, ITier.Tier.SIX)
    { } // solhint-disable-line no-empty-blocks


    function ifSeven()
        external
        view
        onlyTier(msg.sender, ITier.Tier.SEVEN)
    { } // solhint-disable-line no-empty-blocks


    function ifEight()
        external
        view
        onlyTier(msg.sender, ITier.Tier.EIGHT)
    { } // solhint-disable-line no-empty-blocks
}