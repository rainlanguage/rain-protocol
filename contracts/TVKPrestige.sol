// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    IERC20 public constant tvk = IERC20(0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988);

    mapping (address => uint256) public statuses;

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
    // 100 000 TVK
    uint256 public constant diamond = uint256(10 ** (18 + 5));

    constructor() {}

    function levels() pure public returns (uint256[6] memory) {
        return [copper, bronze, silver, gold, platinum, diamond];
    }

    function status(address _account) external override view returns (uint256 _start_block, Status _current_status) {
        uint256 _encoded_status = statuses[_account];
        _start_block = _encoded_status >> 128;
        // Uninitialized status is the current block.
        if (_start_block == 0) {
            _start_block = block.number;
        }
        _current_status = Status(uint128(statuses[_account]));
    }

    function set_status(address _account, Status _new_status) external override {
        (uint256 _start_block, Status _current_status) = this.status(_account);
        uint256 _current = levels()[uint(_current_status)];
        // Status enum casts to level index.
        uint256 _new_limit = levels()[uint(_new_status)];

        if (_new_limit >= _current) {
            // Initialize _start_block if needed.
            // Otherwise preserve it for upgrading members.
            if (_start_block == 0) {
                _start_block = block.number;
            }
            // Going up, take ownership of TVK.
            tvk.transferFrom(_account, address(this), SafeMath.sub(
                _new_limit,
                _current
            ));
        } else {
            // Reset _start_block.
            _start_block = block.number;
            // Going down, process a refund.
            tvk.transfer(_account, SafeMath.sub(
                _current,
                _new_limit
            ));
        }

        emit StatusChange(_account, [_current_status, _new_status]);

        statuses[_account] = uint256(uint128(_start_block) << 128 | uint128(uint8(_new_status)));
    }
}