// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    IERC20 public constant tvk = IERC20(0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988);

    mapping (address => Status) public statuses;

    // Nothing, this is everyone.
    uint256 public constant copper = uint256(0);
    // 1000 TVK
    uint256 public constant bronze = uint256(10 ** (18 + 3));
    // 5000 TVK
    uint256 public constant silver = uint256(5 * 10 ** (18 + 3));
    // 10 000 TVK
    uint256 public constant gold = uint256(10 ** (18 + 4));
    // 25 000 TVK
    uint256 public constant platinum = uint256(25 * 10 ** (18 + 3));

    constructor() {}

    function levels() pure public returns (uint256[5] memory) {
        return [copper, bronze, silver, gold, platinum];
    }

    function set_status(address _account, Status _status) external override {
        uint256 _current = levels()[uint256(this.status(_account))];
        // Status enum casts to level index.
        uint256 _new_limit = levels()[uint256(_status)];

        // Going up, take ownership of TVK.
        if (_new_limit >= _current) {
            tvk.transferFrom(_account, address(this), SafeMath.sub(
                _new_limit,
                _current
            ));
        // Going down, process a refund.
        } else {
            tvk.transfer(_account, SafeMath.sub(
                _current,
                _new_limit
            ));
        }

        emit StatusChange(_account, this.status(_account), _status);
        statuses[_account] = _status;
    }

    function status(address _account) external override view returns (Status) {
        return statuses[_account];
    }
}