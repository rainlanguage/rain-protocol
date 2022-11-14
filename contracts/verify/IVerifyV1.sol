// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

type VerifyStatus is uint;

interface IVerifyV1 {
    function accountStatusAtTime(
        address account,
        uint timestamp
    ) external view returns (VerifyStatus);
}
