// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.6;

pragma experimental ABIEncoderV2;

import { RedeemableERC20Pool, Config } from "./RedeemableERC20Pool.sol";

contract RedeemableERC20PoolFactory {

    event NewContract(
        address indexed _caller,
        address indexed _contract
    );

    mapping(address => bool) public contracts;

    function newContract(
        Config memory _config
    ) external returns(RedeemableERC20Pool) {
        RedeemableERC20Pool _contract = new RedeemableERC20Pool(_config);
        contracts[address(_contract)] = true;
        emit NewContract(msg.sender, address(_contract));

        _contract.transferOwnership(msg.sender);
        return _contract;
    }
}