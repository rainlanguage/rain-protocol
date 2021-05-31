// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "./Status.sol";

contract AnyStatus is Status {
    function statusReport(address) public override view returns (uint256) {
        return 0;
    }
}