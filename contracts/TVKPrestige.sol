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

    function _status(address account) private view returns (uint256 start_block, Status current_status) {
        uint256 _encoded_status = statuses[account];
        start_block = _encoded_status >> 128;
        // Uninitialized status is the current block.
        if (start_block == 0) {
            start_block = block.number;
        }
        current_status = Status(uint128(statuses[account]));
    }

    function status(address account) external override view returns (uint256 start_block, Status current_status) {
        return _status(account);
    }

    function set_status(address account, Status new_status, bytes memory) external override {
        (uint256 start_block, Status current_status) = _status(account);
        uint256 _current_tvk = levels()[uint(current_status)];
        // Status enum casts to level index.
        uint256 _new_tvk = levels()[uint(new_status)];

        if (_new_tvk >= _current_tvk) {
            // Initialize _start_block if needed.
            // Otherwise preserve it for upgrading members.
            if (start_block == 0) {
                start_block = block.number;
            }
            // Going up, take ownership of TVK.
            tvk.transferFrom(account, address(this), SafeMath.sub(
                _new_tvk,
                _current_tvk
            ));
        } else {
            // Reset _start_block.
            start_block = block.number;
            // Going down, process a refund.
            tvk.transfer(account, SafeMath.sub(
                _current_tvk,
                _new_tvk
            ));
        }

        emit StatusChange(account, [current_status, new_status]);

        statuses[account] = uint256(uint128(start_block) << 128 | uint128(uint8(new_status)));
    }
}