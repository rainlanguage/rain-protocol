// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IPrestige.sol";

contract TVKPrestige is IPrestige {
    IERC20 public constant tvk = IERC20(0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988);

    uint256 public constant common = uint256(0);
    uint256 public constant uncommon = uint256(10 ** 18);
    uint256 public constant rare = uint256(20 ** 18);
    uint256 public constant special = uint256(50 ** 18);
    uint256 public constant legendary = uint256(100 ** 18);
    uint256 public constant platinum = uint256(200 ** 18);

    constructor() {}

    function levels() pure public returns (uint256[6] memory) {
        return [common, uncommon, rare, special, legendary, platinum];
    }

    function set_status(address _account, Status _status) external override {
        emit StatusChange(_account, this.status(_account), _status);

        uint256 _current = tvk.balanceOf(_account);
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

        require(tvk.balanceOf(_account) == _new_limit, "ERR_STATUS_FUND");
    }

    function status(address _account) external override view returns (Status) {
        uint256 balance = tvk.balanceOf(_account);
        uint256[6] memory _levels = levels();
        uint8 _i;
        for (_i = 0; _i < 6; _i++) {
            // Someone could grief a user by sending TVK to this account
            // if we require exact balances on lookup.
            if (_levels[_i] > balance) {
                return Status(_i-1);
            }
            else if (_levels[_i] == balance) {
                return Status(_i);
            }
        }
        // We checked every level and balance larger than all.
        return Status(_i);
    }
}