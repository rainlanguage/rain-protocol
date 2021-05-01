// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    using SafeERC20 for IERC20;

    // Hardcoded as a constant to make auditing easier and lower storage requirements a bit.
    IERC20 public constant TVK = IERC20(
        0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988
    );


    mapping(address => uint256) public statuses;


    // Nothing, this can be anyone.
    uint256 public constant COPPER = uint256(0);
    // 1000 TVK
    uint256 public constant BRONZE = uint256(10 ** (18+3));
    // 5000 TVK
    uint256 public constant SILVER = uint256(5*10 ** (18+3));
    // 10 000 TVK
    uint256 public constant GOLD = uint256(10 ** (18+4));
    // 25 000 TVK
    uint256 public constant PLATINUM = uint256(25*10 ** (18+3));
    // 100 000 TVK
    uint256 public constant DIAMOND = uint256(10 ** (18+5));
    // 250 000 TVK
    uint256 public constant CHAD = uint256(25*10 ** (18+4));
    // 1 000 000 TVK
    uint256 public constant JAWAD = uint256(10 ** (18+6));



    /// Updates the level of an account by an entered level
    /// @param account the account to change the status.
    /// @param newStatus the new status to be changed.
    function setStatus(address account, Status newStatus, bytes memory) 
        external 
        override 
    {
        uint256 _report = statuses[account];

        // Initialize the report to the current block if we've never seen this account.
        // slither-disable-next-line incorrect-equality
        if (_report == 0) {
            _report = block.number;
        }

        // Read the status report to find the highest non-zero status level.
        uint256 _currentStatusInt = 0;
        for (uint256 i = 0; i < 8; i++) {
            // The shift right removes statuses below this status.
            // The uint32 cast removes statuses above this status.
            uint32 _ithStatusStart = uint32(uint256(_report >> (i*32)));
            if (_ithStatusStart > 0) {
                _currentStatusInt = i;
            }
        }
        uint256 _newStatusInt = uint256(newStatus);

        // Zero out everything above the new status.
        _report = _truncateStatusesAbove(_report, _newStatusInt);

        // Anything between the current/new statuses needs the current block number.
        for (uint256 i = _currentStatusInt + 1; i <= _newStatusInt; i++) {
            _report = _report | uint256(block.number << (i*32));
        }
        statuses[account] = _report;

        // Emit this event for IPrestige.
        emit StatusChange(account, [Status(_currentStatusInt), newStatus]);

        // Last thing to do as checks-effects-interactions.
        // Handle the TVK transfer.
        // Convert the current status to a TVK amount.
        uint256 _currentTvk = levels()[_currentStatusInt];
        // Convert the new status to a TVK amount.
        uint256 _newTvk = levels()[_newStatusInt];

        if (_newTvk >= _currentTvk) {
            // Going up, take ownership of TVK.
            TVK.safeTransferFrom(account, address(this), SafeMath.sub(
                _newTvk,
                _currentTvk
            ));
        } else {
            // Going down, process a refund.
            TVK.safeTransfer(account, SafeMath.sub(
                _currentTvk,
                _newTvk
            ));
        }
    }


    /// Return status report
    /// @param account - Account to be reported on.
    /// @return uint32 the block number that corresponds to the current status report.
    function statusReport(address account) 
        external 
        override 
        view 
        returns (uint256) 
    {
        return statuses[account];
    }


    /// Return existing levels
    /// @return uint256 array of all existing levels
    function levels() public pure returns (uint256[8] memory) {
        return [COPPER, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, CHAD, JAWAD];
    }


    /// Return zeroes out all the statuses above the provided status.
    /// @param report - Status report to truncate with high bit zeros
    /// @param status - Status level to truncate above (exclusive)
    /// @return uint256 the truncated report.
    function _truncateStatusesAbove(uint256 report, uint256 status)
        private 
        pure 
        returns (uint256) 
    {
        uint256 _mask = uint256(
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
        );
        uint256 _offset = (uint256(status) + 1) * 32;
        _mask = (_mask >> _offset) << _offset;
        return report & ~_mask;
    }
}