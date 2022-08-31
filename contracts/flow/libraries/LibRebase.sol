// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibVMState.sol";
import "../../vm/runtime/LibStackTop.sol";
import "../../math/FixedPointMath.sol";

library LibRebase {
    using LibVMState for VMState;
    using LibStackTop for StackTop;
    using FixedPointMath for uint256;

    function rebaseRatio(VMState memory state_, SourceIndex entrypoint_)
        internal
        view
        returns (uint256)
    {
        return state_.eval(entrypoint_).peek();
    }

    /// User input needs to be divided by the ratio to compensate for the
    /// multiples calculated upon output.
    function rebaseInput(uint256 input_, uint256 ratio_)
        internal
        pure
        returns (uint256)
    {
        return input_.fixedPointDiv(ratio_);
    }

    /// Internal data needs to be multiplied by the ratio as it is output.
    /// Inputs will be divided by the ratio when accepted.
    function rebaseOutput(uint256 output_, uint256 ratio_)
        internal
        pure
        returns (uint256)
    {
        return output_.fixedPointMul(ratio_);
    }
}
