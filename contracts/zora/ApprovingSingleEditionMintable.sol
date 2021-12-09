// SPDX-License-Identifier: CAL

pragma solidity ^0.8.6;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@zoralabs/nft-editions-contracts/contracts/IEditionSingleMintable.sol";
import "@zoralabs/nft-editions-contracts/contracts/SingleEditionMintable.sol";
import "hardhat/console.sol";

contract ApprovingSingleEditionMintable is
    IEditionSingleMintable,
    Initializable
{
    address private underlyingContract;

    function initialize(address underlyingContract_) public initializer {
        underlyingContract = underlyingContract_;
    }

    function mintEdition(address to) external override returns (uint256) {
        // approval logic...
        return SingleEditionMintable(underlyingContract).mintEdition(to);
    }

    function mintEditions(address[] memory to)
        external
        override
        returns (uint256)
    {
        // approval logic...
        return SingleEditionMintable(underlyingContract).mintEditions(to);
    }

    function numberCanMint() external override view returns (uint256) {
        return SingleEditionMintable(underlyingContract).numberCanMint();
    }

    function owner() external override view returns (address) {
        return SingleEditionMintable(underlyingContract).owner();
    }
}
