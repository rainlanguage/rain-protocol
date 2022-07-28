// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../vm/StandardVM.sol";
import "../vm/VMStateBuilder.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 2; // note this value

/// @title StackHeightTest
/// Test contract that has misconfigured final stack height.
contract StackHeightTest is StandardVM {
    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {}

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        _saveVMState(stateConfig_, boundss_);
    }
}
