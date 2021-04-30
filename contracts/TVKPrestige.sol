// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    using SafeERC20 for IERC20;
    IERC20 public constant TVK = IERC20(0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988);

    mapping (address => uint256) public statuses;

    // Nothing, this can be anyone.
    uint256 public constant COPPER = uint256(0);
    // 1000 TVK
    uint256 public constant BRONZE = uint256(10 ** (18 + 3));
    // 5000 TVK
    uint256 public constant SILVER = uint256(5 * 10 ** (18 + 3));
    // 10 000 TVK
    uint256 public constant GOLD = uint256(10 ** (18 + 4));
    // 25 000 TVK
    uint256 public constant PLATINUM = uint256(25 * 10 ** (18 + 3));
    // 100 000 TVK
    uint256 public constant DIAMOND = uint256(10 ** (18 + 5));
    // 250 000 TVK
    uint256 public constant CHAD = uint256(25 * 10 ** (18 + 4));
    // 1 000 000 TVK
    uint256 public constant JAWAD = uint256(10 ** (18 + 6));

    constructor() {}

    /**
    *   Returns a uint256 array of all existing levels
    **/
    function levels() pure public returns (uint256[8] memory) {
        return [COPPER, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, CHAD, JAWAD];
    }

    /**
    *   Returns uint32 the block number that corresponds to the current status report.
    *   address account - Account to be reported on.
    **/
    function statusReport(address account) external override view returns (uint256) {
        return statuses[account];
    }

    /**
    *   Updates the level of an account by an entered level
    *   address account - Account to change the status.
    *   Status newStatus - New status to be changed.
    *   bytes - Arbitrary input to disambiguate ownership (not used here).
    **/
    function setStatus(address account, Status newStatus, bytes memory) external override {
        uint256 _report = statuses[account];

        uint current_status = 0;
        for (uint i=0; i<8; i++) {
            uint32 _ith_status_start = uint32(uint256(_report >> (i * 32)));
            if (_ith_status_start > 0) {
                current_status = i;
            }
        }

        uint256 _current_tvk = levels()[current_status];
        // Status enum casts to level index.
        uint256 _new_tvk = levels()[uint(newStatus)];

        emit StatusChange(account, [Status(current_status), newStatus]);

        if (_new_tvk >= _current_tvk) {
            for (uint i=0; i<8; i++) {
                // Zero everything above the current status.
                 if (i>current_status || uint32(_report) == 0) {
                    uint32 _offset = uint32(i * 32);
                    uint256 _mask = uint256(0xffffffff) << _offset;
                    _report = _report & ~_mask;

                    // Anything up to new status needs a new block number.
                    if (i<=uint(newStatus)) {
                        _report = _report | uint256(uint256(block.number) << _offset);
                    }
                }
            }
            statuses[account] = _report;

            // Going up, take ownership of TVK.
            // Last thing to do as checks-effects-interactions
            TVK.safeTransferFrom(account, address(this), SafeMath.sub(
                _new_tvk,
                _current_tvk
            ));
        } else {
            uint256 _mask = uint256(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
            if (0==uint(newStatus)) {
                // // Zero everything above the current status.
                // uint32 _offset = uint32(0 * 32);
                // _report = _report & ~_mask;

                // Anything up to new status needs a new block number.
                _report = block.number;
            } else {
                // Zero out everything above the new status.
                uint256 _offset = (uint(newStatus) + 1) * 32;
                _mask = (_mask >> _offset) << _offset;
                _report = _report & ~_mask;
            }
            statuses[account] = _report;

            // Going down, process a refund.
            // Last thing to do as checks-effects-interactions
            TVK.safeTransfer(account, SafeMath.sub(
                _current_tvk,
                _new_tvk
            ));
        }
    }
}