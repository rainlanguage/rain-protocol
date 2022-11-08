// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../../../array/LibUint256Array.sol";
import "../../../../interpreter/run/StandardInterpreter.sol";
import "../../../../interpreter/deploy/RainInterpreterIntegrity.sol";
import {AllStandardOps} from "../../../../interpreter/ops/AllStandardOps.sol";

uint256 constant MIN_FINAL_STACK_INDEX = 2;

/// @title StackHeightTest
/// Test contract that has misconfigured final stack height.
contract StackHeightTest is StandardInterpreter {
    using LibUint256Array for uint256;

    constructor(
        address interpreterIntegrity_
    ) StandardInterpreter(interpreterIntegrity_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        _saveInterpreterState(stateConfig_, MIN_FINAL_STACK_INDEX);
    }
}
