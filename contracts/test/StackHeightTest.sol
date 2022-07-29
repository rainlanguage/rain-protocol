// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../array/LibUint256Array.sol";
import "../vm/runtime/StandardVM.sol";
import "../vm/integrity/RainVMIntegrity.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";

SourceIndex constant ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant MIN_FINAL_STACK_INDEX = 2; // note this value

/// @title StackHeightTest
/// Test contract that has misconfigured final stack height.
contract StackHeightTest is StandardVM {
    using LibUint256Array for uint256;

    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        _saveVMState(stateConfig_, MIN_FINAL_STACK_INDEX.arrayFrom());
    }
}
