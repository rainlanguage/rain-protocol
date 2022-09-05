// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./LibIntegrityState.sol";

interface IInterpreterIntegrity {
    function ensureIntegrity(
        bytes[] memory sources,
        uint256 constantsLength,
        uint256[] memory finalStacks
    ) external view returns (uint256 scratch, uint256 maximumStackHeight);
}
