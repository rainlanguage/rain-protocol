// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "./ISingleEditionMintable.sol";

interface ISingleEditionMintableCreator {
    function createEdition (
        string memory _name,
        string memory _symbol,
        string memory _description,
        string memory _animationUrl,
        bytes32 _animationHash,
        string memory _imageUrl,
        bytes32 _imageHash,
        uint256 _editionSize,
        uint256 _royaltyBPS
    ) external returns (uint256);

    function getEditionAtId(uint256 editionId)
        external view returns (ISingleEditionMintable);
}
