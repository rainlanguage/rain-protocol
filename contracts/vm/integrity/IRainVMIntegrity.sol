// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../runtime/RainVM.sol";
import "./LibIntegrityState.sol";

interface IRainVMIntegrity {
    function ensureIntegrity(
        StorageOpcodesRange memory storageOpcodesRange_,
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256[] memory finalStacks_
    ) external view returns (uint256);
}
