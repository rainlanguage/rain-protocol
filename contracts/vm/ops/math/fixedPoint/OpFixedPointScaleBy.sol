// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/FixedPointMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpFixedPointScaleBy
/// @notice Opcode for scaling a number by some OOMs.
library OpFixedPointScaleBy {
    using FixedPointMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _scaleBy(Operand operand_, uint256 a_)
        internal
        pure
        returns (uint256)
    {
        return a_.scaleBy(int8(uint8(Operand.unwrap(operand_))));
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _scaleBy);
    }

    function scaleBy(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_scaleBy, operand_);
    }
}
