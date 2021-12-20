// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "hardhat/console.sol";
import "./ISingleEditionMintable.sol";

contract ApprovingSingleEditionMintable is Initializable {
    address private underlyingContract;

    function initialize(address underlyingContract_) public initializer {
        underlyingContract = underlyingContract_;
    }

    function mintEdition(address to) external returns (uint256) {
        // approval logic...
        return ISingleEditionMintable(underlyingContract).mintEdition(to);
    }

    function mintEditions(address[] memory to) external returns (uint256) {
        // approval logic...
        return ISingleEditionMintable(underlyingContract).mintEditions(to);
    }
}
