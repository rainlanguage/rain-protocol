// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./RainVM.sol";
import "./LibStackTop.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

struct IntegrityState {
    bytes[] sources;
    function(IntegrityState memory, uint256, StackTop)
        view
        returns (StackTop)[] integrityFunctionPointers;
    StorageOpcodesRange storageOpcodesRange;
    uint256 constantsLength;
    uint256 contextLength;
    StackTop stackBottom;
    StackTop stackMaxTop;
}

library LibIntegrityState {
    using LibStackTop for StackTop;
    using Math for uint256;

    function push(IntegrityState memory integrityState_, StackTop stackTop_)
        internal
        pure
        returns (StackTop stackTopAfter_)
    {
        stackTopAfter_ = stackTop_.up();
        integrityState_.stackMaxTop = StackTop.wrap(
            StackTop.unwrap(integrityState_.stackMaxTop).max(
                StackTop.unwrap(stackTopAfter_)
            )
        );
    }

    modifier popUnderflowCheck(
        IntegrityState memory integrityState_,
        StackTop stackTop_
    ) {
        _;
        require(
            // Stack bottom may be non-zero so check we are above it.
            StackTop.unwrap(stackTop_) >=
                StackTop.unwrap(integrityState_.stackBottom) &&
                // If we underflowed zero then we will be above the stack max top.
                StackTop.unwrap(stackTop_) <
                StackTop.unwrap(integrityState_.stackMaxTop),
            "STACK_UNDERFLOW"
        );
    }

    function pop(IntegrityState memory integrityState_, StackTop stackTop_)
        internal
        pure
        popUnderflowCheck(integrityState_, stackTopAfter_)
        returns (StackTop stackTopAfter_)
    {
        stackTopAfter_ = stackTop_.down();
    }

    function pop(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        uint256 n_
    )
        internal
        pure
        popUnderflowCheck(integrityState_, stackTopAfter_)
        returns (StackTop stackTopAfter_)
    {
        stackTopAfter_ = stackTop_.down(n_);
    }
}
