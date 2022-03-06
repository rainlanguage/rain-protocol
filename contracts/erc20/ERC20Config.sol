// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

/// Constructor config for standard Open Zeppelin ERC20.
struct ERC20Config {
    /// Name as defined by Open Zeppelin ERC20.
    string name;
    /// Symbol as defined by Open Zeppelin ERC20.
    string symbol;
    /// Distributor address of the initial supply.
    /// MAY be zero.
    address distributor;
    /// Initial supply to mint.
    /// MAY be zero.
    uint256 initialSupply;
}
