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

    event StatusChange(address account, Status[2] change);

    function set_status(address account, Status new_status, bytes memory data) external;

    function status(address account) external view returns (uint256 start_block, Status current_status);
}