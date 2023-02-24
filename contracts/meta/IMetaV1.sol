// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

bytes8 constant META_MAGIC_NUMBER_V1 = bytes8(keccak256(abi.encodePacked("rain-meta-v1")));

/// @title IMetaV1
interface IMetaV1 {
    event MetaV1(address sender, bytes meta);
}
