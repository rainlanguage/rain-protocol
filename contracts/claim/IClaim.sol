//SPDX-License-Identifier: CAL
pragma solidity 0.8.10;

interface IClaim {

    /// @param account The account receiving the `Claim`.
    /// @param data Associated data for the claim call.
    event Claim(
        address indexed account,
        bytes data
    );

    function claim(address account, bytes memory data) external;
}