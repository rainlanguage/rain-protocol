// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.6;

pragma experimental ABIEncoderV2;

import { SeedERC20, Config } from "./SeedERC20.sol";

contract SeedERC20Factory {

    event NewContract(
        address indexed _caller,
        address indexed _contract
    );

    mapping(address => bool) public contracts;

    function newContract(
        Config memory _config
    ) external returns(SeedERC20) {
        SeedERC20 _contract = new SeedERC20(_config);
        contracts[address(_contract)] = true;
        emit NewContract(msg.sender, address(_contract));

        _contract.transferOwnership(msg.sender);
        return _contract;
    }
}