// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "hardhat/console.sol";
import "./ISingleEditionMintable.sol";
import { TierByConstruction } from "../tier/TierByConstruction.sol";
import { ITier } from "../tier/ITier.sol";

contract GatedSingleEditionMintable is TierByConstruction {
    address private underlyingContract;
    ITier.Tier public minimumStatus;

    constructor (
        address underlyingContract_,
        ITier tier_,
        ITier.Tier minimumStatus_
    ) TierByConstruction(tier_) {
        underlyingContract = underlyingContract_;
        minimumStatus = minimumStatus_;
    }

    function mintEdition(address to) external returns (uint256) {
        // TODO: Should this be the address of the sender or recipient?
        require(
            isTier(to, minimumStatus),
            "MIN_TIER"
        );
        return ISingleEditionMintable(underlyingContract).mintEdition(to);
    }

    function mintEditions(address[] memory to) external returns (uint256) {
        // TODO: Check tiers
        return ISingleEditionMintable(underlyingContract).mintEditions(to);
    }
}
