// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./RainVM.sol";
import "./LibStackTop.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "hardhat/console.sol";

struct IntegrityState {
    bytes[] sources;
    function(IntegrityState memory, Operand, StackTop)
        view
        returns (StackTop)[] integrityFunctionPointers;
    StorageOpcodesRange storageOpcodesRange;
    uint256 constantsLength;
    uint256 contextLength;
    StackTop stackBottom;
    StackTop stackMaxTop;
}

library LibIntegrityState {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;
    using Math for uint256;

    function push(IntegrityState memory integrityState_, StackTop stackTop_)
        internal
        pure
        returns (StackTop stackTopAfter_)
    {
        stackTopAfter_ = stackTop_.up();
        if (
            StackTop.unwrap(stackTopAfter_) >
            StackTop.unwrap(integrityState_.stackMaxTop)
        ) {
            integrityState_.stackMaxTop = stackTopAfter_;
        }
    }

    function push(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        uint256 n_
    ) internal pure returns (StackTop stackTopAfter_) {
        stackTopAfter_ = stackTop_.up(n_);
        if (
            StackTop.unwrap(stackTopAfter_) >
            StackTop.unwrap(integrityState_.stackMaxTop)
        ) {
            integrityState_.stackMaxTop = stackTopAfter_;
        }
    }

    modifier popUnderflowCheck(
        IntegrityState memory integrityState_,
        StackTop stackTop_
    ) {
        _;
        require(
            // Stack bottom may be non-zero so check we are above it.
            (StackTop.unwrap(stackTop_) >=
                StackTop.unwrap(integrityState_.stackBottom)) &&
                // If we underflowed zero then we will be above the stack max top.
                (StackTop.unwrap(stackTop_) <
                    StackTop.unwrap(integrityState_.stackMaxTop)),
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

    function applyFnN(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256, uint256) internal view returns (uint256),
        uint256 n_
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, n_));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256) internal view returns (uint256)
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(Operand, uint256) internal view returns (uint256)
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(Operand, uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256, uint256, uint256) internal view returns (uint256)
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 3));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256[] memory) internal view returns (uint256),
        uint256 length_
    ) internal pure returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, length_));
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256),
        uint256 length_
    ) internal pure returns (StackTop) {
        unchecked {
            return
                integrityState_.push(
                    integrityState_.pop(stackTop_, length_ + 2)
                );
        }
    }

    function applyFn(
        IntegrityState memory integrityState_,
        StackTop stackTop_,
        function(uint256, uint256, uint256, uint256[] memory)
            internal
            view
            returns (uint256),
        uint256 length_
    ) internal pure returns (StackTop) {
        unchecked {
            return
                integrityState_.push(
                    integrityState_.pop(stackTop_, length_ + 3)
                );
        }
    }
}
