// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

interface ISingleEditionMintable {
  function mintEdition(address to) external returns (uint256);
  function mintEditions(address[] memory to) external returns (uint256);
  function setApprovedMinter(address minter, bool allowed) external;
  function transferOwnership(address newOwner) external;
}
