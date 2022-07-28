// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../../array/LibUint256Array.sol";
import "../../LibIntegrityState.sol";

/// @title OpCall
/// @notice Opcode for calling eval with a new scope.
library OpCall {
    using LibStackTop for StackTop;
    using LibVMState for VMState;

    function integrity(
        IntegrityState memory,
        Operand,
        StackTop
    ) internal pure returns (StackTop) {
        revert("UNIMPLEMENTED");
    }

    /// Call eval with a new scope.
    function call(
        VMState memory state_,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        uint256 inputs_ = Operand.unwrap(operand_) & 0x7;
        uint256 outputs_ = (Operand.unwrap(operand_) >> 3) & 0x3;
        SourceIndex callSourceIndex_ = SourceIndex.wrap((Operand.unwrap(operand_) >> 5) & 0x7);
        stackTop_ = stackTop_.down(inputs_);
        StackTop stackTopAfter_ = state_.eval(
            state_,
            callSourceIndex_,
            stackTop_
        );
        LibUint256Array.unsafeCopyValuesTo(
            StackTop.unwrap(stackTopAfter_.down(outputs_)),
            StackTop.unwrap(stackTop_),
            outputs_
        );
        return stackTop_.up(outputs_);
    }
}
