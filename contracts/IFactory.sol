// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

interface IFactory {
    event NewContract(
        address indexed _caller,
        address indexed _contract
    );

    function createChild(bytes calldata data_) external returns(address);

    function isChild(address maybeChild_) external returns(bool);
}