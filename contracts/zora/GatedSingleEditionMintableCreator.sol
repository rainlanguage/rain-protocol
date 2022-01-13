// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "hardhat/console.sol";
import "./GatedSingleEditionMintable.sol";
import "./ISingleEditionMintableCreator.sol";
import { ITier } from "../tier/ITier.sol";

contract GatedSingleEditionMintableCreator {
    address private factory;

    struct Edition {
        string name;
        string symbol;
        string description;
        string animationUrl;
        string imageUrl;
        bytes32 animationHash;
        bytes32 imageHash;
        uint256 editionSize;
        uint256 royaltyBPS;
    }

    event CreatedGatedEdition(
        uint256 editionId,
        address creator,
        address wrapperContractAddress,
        address underlyingContractAddress,
        Edition edition
    );

    /// @param factory_ The address of the underlying
    ///   `SingleEditionMintableFactory` that will be used to create editions.
    constructor(address factory_) {
        factory = factory_;
    }

    /// Calls the underlying `createEdition` method on
    /// `SingleEditionMintableFactory` to create a `SingleEditionMintable` and
    /// then clones an `GatedSingleEditionMintable` wrapper contract.
    function createEdition(
        Edition memory edition,
        ITier _tier,
        ITier.Tier _minimumStatus
    ) external returns (uint256) {
        uint256 id = ISingleEditionMintableCreator(factory).createEdition(
            edition.name,
            edition.symbol,
            edition.description,
            edition.animationUrl,
            edition.animationHash,
            edition.imageUrl,
            edition.imageHash,
            edition.editionSize,
            edition.royaltyBPS
        );

        ISingleEditionMintable underlyingContract =
            ISingleEditionMintableCreator(factory).getEditionAtId(id);

        GatedSingleEditionMintable wrapperContract =
            new GatedSingleEditionMintable(
                address(underlyingContract),
                _tier,
                _minimumStatus
            );

        underlyingContract.setApprovedMinter(address(wrapperContract), true);
        underlyingContract.setApprovedMinter(address(this), false);
        underlyingContract.transferOwnership(address(wrapperContract));

        emit CreatedGatedEdition(
            id,
            msg.sender,
            address(wrapperContract),
            address(underlyingContract),
            edition
        );

        return id;
    }
}
