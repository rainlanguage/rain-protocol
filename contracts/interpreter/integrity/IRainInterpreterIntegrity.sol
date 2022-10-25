// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../runtime/RainInterpreter.sol";
import "./LibIntegrityState.sol";

interface IRainInterpreterIntegrity {
    function ensureIntegrity(
        StorageOpcodesRange memory storageOpcodesRange,
        bytes[] memory sources,
        uint256 constantsLength,
        uint256[] memory finalStacks
    )
        external
        view
        returns (
            uint256 scratch,
            uint256 contextScratch_,
            uint256 maximumStackHeight
        );
}
