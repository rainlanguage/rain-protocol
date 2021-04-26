// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public constant tvk = IERC20(
        0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988
    );


    mapping (address => uint256) public statuses;


    // Nothing, this is everyone.
    uint256 public constant copper = uint256(0);
    // 1000 TVK
    uint256 public constant bronze = uint256(10 ** (18+3));
    // 5000 TVK
    uint256 public constant silver = uint256(5*10 ** (18+3));
    // 10 000 TVK
    uint256 public constant gold = uint256(10 ** (18+4));
    // 25 000 TVK
    uint256 public constant platinum = uint256(25*10 ** (18+3));
    // 100 000 TVK
    uint256 public constant diamond = uint256(10 ** (18+5));
    // 250 000 TVK
    uint256 public constant chad = uint256(25*10 ** (18+4));
    // 1 000 000 TVK
    uint256 public constant jawad = uint256(10 ** (18+6));


    constructor() {
    }


    /// Updates the level of an account by an entered level
    /// @param  account the account to change the status.
    /// @param new_status the new status to be changed.
    function set_status(
        address account, 
        Status new_status, 
        bytes memory
    ) 
    external override 
    {
        uint256 _report = _status_report(account);
        
        uint current_status = 0;
        for (uint i = 0; i < 8; i++) {
            uint32 _ith_status_start = uint32(uint256(_report >> (i*32)));
            if (_ith_status_start > 0) {
                current_status = i;
            }
        }

        uint256 _current_tvk = levels()[current_status];
        // Status enum casts to level index.
        uint256 _new_tvk = levels()[uint(new_status)];

        if (_new_tvk >= _current_tvk) {
            //Going up, take ownership of TVK.
            tvk.safeTransferFrom(account, address(this), _new_tvk.sub(
                _current_tvk
            ));

            for (uint i = 0; i < 8; i++) {
                // Zero everything above the current status.
                 if (i > current_status || uint32(_report) == 0) {
                    uint32 _offset = uint32(i * 32);
                    uint256 _mask = uint256(0xffffffff) << _offset;
                    _report = _report & ~_mask;
                    
                    // Anything up to new status needs a new block number.
                    if (i <= uint(new_status)) {
                        _report = _report | uint256(uint256(block.number) << _offset);
                    }
                }
            }
        } else {
            //Going down, process a refund.
            tvk.safeTransfer(account, _current_tvk.sub(
                _new_tvk
            ));

            uint256 _mask = uint256(
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            );

            if (0 == uint(new_status)) {
                // Zero everything above the current status.
                uint32 _offset = uint32(0 * 32);
                _report = _report & ~_mask;
                    
                // Anything up to new status needs a new block number.
                _report = _report | uint256(uint256(block.number) << _offset);
            } else {
                // Zero out everything above the new status.
                uint256 _offset = (uint(new_status)+1) * 32;
                _mask = (_mask >> _offset) << _offset;
                _report = _report & ~_mask;
            }
        }
        
        emit StatusChange(account, [Status(current_status), new_status]);

        statuses[account] = _report;
    }

    /// Return status report
    /// @param account - Account to be consulted.
    /// @return uint32 the block number that corresponds to the current status report.
    function status_report(address account) 
        external 
        override 
        view 
        returns (uint256) 
    {
        return _status_report(account);
    }


    /// Return existing levels
    /// @return uint256 array of all existing levels
    function levels() public pure returns (uint256[8] memory) {
        return [copper, bronze, silver, gold, platinum, diamond, chad, jawad];
    }


    /// Return status report
    /// @param account Account to be consulted.
    /// @return uint256 corresponding to the status of the entered account.
    function _status_report(address account) private view returns (uint256) {
        return statuses[account];
    }
}