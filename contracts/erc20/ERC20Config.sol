// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

/// Constructor config for standard Open Zeppelin ERC20.
/// @param name Name as defined by Open Zeppelin ERC20.
/// @param symbol Symbol as defined by Open Zeppelin ERC20.
/// @param distributor Distributor address of the initial supply.
/// MAY be zero.
/// @param initialSupply Initial supply to mint.
/// MAY be zero.
struct ERC20Config {
    string name;
    string symbol;
    address distributor;
    uint256 initialSupply;
}
