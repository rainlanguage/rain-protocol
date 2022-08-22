// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../math/SaturatingMath.sol";
import "../../../runtime/LibStackTop.sol";
import "../../../runtime/LibVMState.sol";
import "../../../integrity/LibIntegrityState.sol";

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
            integrityState_.applyN(
                stackTop_,
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }

    function intern(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return
            stackTop_.applyN(
                SaturatingMath.saturatingAdd,
                Operand.unwrap(operand_)
            );
    }

    function extern(uint256[] memory inputs_)
        internal
        view
        returns (uint256[] memory)
    {
        return inputs_.applyN(SaturatingMath.saturatingAdd);
    }
}
