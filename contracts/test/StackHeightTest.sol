// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {RainVM} from "../vm/RainVM.sol";
import "../vm/VMStateBuilder.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant ENTRYPOINTS_LENGTH = 1;
uint256 constant MIN_FINAL_STACK_INDEX = 2; // note this value

/// @title StackHeightTest
/// Test contract that has misconfigured final stack height.
contract StackHeightTest is RainVM {
    address private immutable self;
    address private immutable vmStateBuilder;
    address private vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    /// Using initialize rather than constructor because fnPtrs doesn't return
    /// the same thing during construction.
    function initialize(StateConfig calldata stateConfig_) external {
        Bounds memory bounds_;
        bounds_.entrypointsLength = ENTRYPOINTS_LENGTH;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            stateConfig_,
            bounds_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.fnPtrs();
    }
}
