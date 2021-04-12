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

    event StatusChange(address _address, Status _old, Status _new);

    function set_status(address _account, Status _status) external;

    function status(address account) external view returns (Status);
}