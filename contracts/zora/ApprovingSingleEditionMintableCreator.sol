// SPDX-License-Identifier: CAL

pragma solidity ^0.8.6;

// solhint-disable-next-line max-line-length
import "@zoralabs/nft-editions-contracts/contracts/SingleEditionMintableCreator.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "hardhat/console.sol";
import "./ApprovingSingleEditionMintable.sol";

contract ApprovingSingleEditionMintableCreator {
    address private factory;

    address private implementation;

    event CreatedApprovingEdition(
        uint256 indexed editionId,
        address indexed creator,
        uint256 editionSize,
        address wrapperContractAddress,
        address underlyingContractAddress
    );

    /// @param factory_ The address of the underlying
    ///   `SingleEditionMintableFactory` that will be used to create editions.
    /// @param implementation_ The address of the
    ///   `ApprovingSingleEditionMintable` contract that will be cloned for
    ///   each `SingleEditionMintable` contract created by the factory.
    constructor(address factory_, address implementation_) {
        factory = factory_;
        implementation = implementation_;
    }

    /// Calls the underlying `createEdition` method on
    /// `SingleEditionMintableFactory` to create a `SingleEditionMintable` and
    /// then clones an `ApprovingSingleEditionMintable` wrapper contract.
    function createEdition(
        string memory _name,
        string memory _symbol,
        string memory _description,
        string memory _animationUrl,
        bytes32 _animationHash,
        string memory _imageUrl,
        bytes32 _imageHash,
        uint256 _editionSize,
        uint256 _royaltyBPS
    ) external returns (uint256) {
        uint256 id = SingleEditionMintableCreator(factory).createEdition(
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

        SingleEditionMintable underlyingContract =
            SingleEditionMintableCreator(factory).getEditionAtId(id);

        address wrapperContract = ClonesUpgradeable.cloneDeterministic(
            implementation,
            bytes32(abi.encodePacked(id))
        );

        ApprovingSingleEditionMintable(wrapperContract)
            .initialize(address(underlyingContract));

        underlyingContract.setApprovedMinter(wrapperContract, true);
        underlyingContract.setApprovedMinter(address(this), false);

        emit CreatedApprovingEdition(
            id,
            msg.sender,
            _editionSize,
            wrapperContract,
            address(underlyingContract)
        );

        return id;
    }

    function getEditionAtId(uint256 editionId)
        external
        view
        returns (ApprovingSingleEditionMintable)
    {
        return
            ApprovingSingleEditionMintable(
                ClonesUpgradeable.predictDeterministicAddress(
                    implementation,
                    bytes32(abi.encodePacked(editionId)),
                    address(this)
                )
            );
    }
}
