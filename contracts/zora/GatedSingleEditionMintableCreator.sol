// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "hardhat/console.sol";
import "./GatedSingleEditionMintable.sol";
import "./ISingleEditionMintableCreator.sol";
import { ITier } from "../tier/ITier.sol";

contract GatedSingleEditionMintableCreator {
    address private factory;

    event CreatedGatedEdition(
        uint256 editionId,
        address creator,
        uint256 editionSize,
        address wrapperContractAddress,
        address underlyingContractAddress
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
        string memory _name,
        string memory _symbol,
        string memory _description,
        string memory _animationUrl,
        bytes32 _animationHash,
        string memory _imageUrl,
        bytes32 _imageHash,
        uint256 _editionSize,
        uint256 _royaltyBPS,
        ITier _tier,
        ITier.Tier _minimumStatus
    ) external returns (uint256) {
        uint256 id = ISingleEditionMintableCreator(factory).createEdition(
            _name,
            _symbol,
            _description,
            _animationUrl,
            _animationHash,
            _imageUrl,
            _imageHash,
            _editionSize,
            _royaltyBPS
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
            _editionSize,
            address(wrapperContract),
            address(underlyingContract)
        );

        return id;
    }
}
