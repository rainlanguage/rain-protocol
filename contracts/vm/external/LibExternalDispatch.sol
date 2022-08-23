// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../runtime/LibStackTop.sol";

library LibExternalDispatch {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;

    // error UnsupportedDispatch();

    function applyFn(
        uint256[] memory inputs_,
        function(uint256, uint256) internal view returns (uint256) fn_
    ) internal view returns (uint256[] memory) {
        (uint256 a_, uint256 b_) = inputs_.asStackTopUp().up(2).peek2();
        return fn_(a_, b_).arrayFrom();
    }

    function applyFnN(
        uint256[] memory inputs_,
        function(uint256, uint256) internal view returns (uint256) fn_
    ) internal view returns (uint256[] memory) {
        return
            inputs_
                .asStackTopUp()
                .up(inputs_.length)
                .applyFnN(fn_, inputs_.length)
                .peek()
                .arrayFrom();
    }
}
