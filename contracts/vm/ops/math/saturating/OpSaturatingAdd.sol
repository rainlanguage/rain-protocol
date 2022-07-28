// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";
import "../../../LibIntegrityState.sol";

/// @title OpSaturatingAdd
/// @notice Opcode for adding N numbers with saturating addition.
library OpSaturatingAdd {
    using SaturatingMath for uint256;
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFnN(
                stackTop_,
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }

    function saturatingAdd(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return
            stackTop_.applyFnN(
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }
}
