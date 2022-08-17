// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../runtime/LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

import "hardhat/console.sol";

/// @title OpAdd
/// @notice Opcode for adding N numbers.
library OpAdd {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;
    using LibUint256Array for uint;

    function _add(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFnN(stackTop_, _add, Operand.unwrap(operand_));
    }

    function intern(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFnN(_add, Operand.unwrap(operand_));
    }

    function extern(
        uint[] calldata inputs_
    ) internal view returns (uint[] memory outputs_) {
        uint accumulator_ = 0;
        for (uint i_ = 0; i_ < inputs_.length; i_++) {
            accumulator_ = _add(accumulator_, inputs_[i_]);
        }
        return accumulator_.arrayFrom();
    }
}
