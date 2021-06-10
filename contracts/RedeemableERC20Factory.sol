// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.6;

pragma experimental ABIEncoderV2;

import { RedeemableERC20, Config as RedeemableERC20Config } from "./RedeemableERC20.sol";
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

struct Config {
    string name;
    string symbol;
    IPrestige prestige;
    IPrestige.Status minimumStatus;
    uint256 totalSupply;
}

contract RedeemableERC20Factory {

    event NewContract(
        address indexed _caller,
        address indexed _contract
    );

    mapping(address => bool) public contracts;

    function newContract(
        Config memory _config
    ) external returns(RedeemableERC20) {
        RedeemableERC20 _contract = new RedeemableERC20(RedeemableERC20Config(
            msg.sender,
            _config.name,
            _config.symbol,
            _config.prestige,
            _config.minimumStatus,
            _config.totalSupply
        ));
        contracts[address(_contract)] = true;
        emit NewContract(msg.sender, address(_contract));

        _contract.transferOwnership(msg.sender);
        return _contract;
    }
}