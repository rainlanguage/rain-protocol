// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IExpressionDeployerV1.sol";
import "./LibIntegrityState.sol";

interface IRainInterpreterIntegrity {
    function ensureIntegrity(
        bytes[] memory sources,
        uint256 constantsLength,
        EncodedConstraints[] memory constraints
    )
        external
        view
        returns (
            uint256 contextReads,
            uint256 stackLength,
            uint stateChangesLength
        );
}
