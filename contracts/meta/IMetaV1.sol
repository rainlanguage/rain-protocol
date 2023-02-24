// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

/// @dev Randomly generated magic number with first bytes oned out.
/// Hex form is 0xff0a89c674ee7874.
uint256 constant META_MAGIC_NUMBER_V1 = 18377652714897045620;

/// @title IMetaV1
interface IMetaV1 {
    event Meta(address sender, bytes meta);
}
