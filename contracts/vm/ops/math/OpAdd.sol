// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../runtime/LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";
import "../../external/LibExternalDispatch.sol";

/// @title OpAdd
/// @notice Opcode for adding N numbers.
library OpAdd {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;
    using LibExternalDispatch for uint256[];
    using LibUint256Array for uint256;

    function _add(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyN(stackTop_, _add, Operand.unwrap(operand_));
    }

    function intern(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyN(_add, Operand.unwrap(operand_));
    }

    function extern(uint256[] memory inputs_)
        internal
        view
        returns (uint256[] memory outputs_)
    {
        return inputs_.applyN(_add);
    }
}
