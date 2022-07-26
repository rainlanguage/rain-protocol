// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./RainVM.sol";
import "./LibStackTop.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

struct IntegrityState {
    bytes[] sources;
    function(IntegrityState memory, uint256, StackTop)
                view
                returns (StackTop)[]
                integrityFunctionPointers;
    StorageOpcodesRange storageOpcodesRange;
    StackTop stackBottom;
    StackTop stackMaxTop;
}

library LibIntegrityState {
    using LibStackTop for StackTop;
    using Math for uint;
    function push(IntegrityState memory integrityState_, StackTop stackTop_) internal pure returns (StackTop stackTopAfter_) {
        stackTopAfter_ = stackTop_.up();
        integrityState_.stackMaxTop = StackTop.wrap(
            StackTop.unwrap(integrityState_.stackMaxTop).max(StackTop.unwrap(stackTopAfter_)));
    }
}