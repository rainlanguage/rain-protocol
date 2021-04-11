// SPDX-License-Identifier: MIT

pragma solidity ^0.7.3;

interface IPrestige {
    enum Status {
        Copper,
        Bronze,
        Silver,
        Gold,
        Platinum,
        Diamond
    }

    event StatusChange(address _address, Status[2] _change);

    function set_status(address _account, Status _new_status) external;

    function status(address account) external view returns (uint256 _start_block, Status _current_status);
}