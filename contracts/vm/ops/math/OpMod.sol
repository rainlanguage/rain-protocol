// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpMod
/// @notice Opcode to mod N numbers.
library OpMod {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _mod(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ % b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyN(stackTop_, _mod, Operand.unwrap(operand_));
    }

    function intern(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return stackTop_.applyN(_mod, Operand.unwrap(operand_));
    }

    function extern(uint256[] memory inputs_)
        internal
        view
        returns (uint256[] memory)
    {
        return inputs_.applyN(_mod_);
    }
}
