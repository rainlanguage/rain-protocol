// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../integrity/LibIntegrityState.sol";
import "../../external/IRainVMExternal.sol";
import "../../runtime/LibVMState.sol";

library OpCallExternal {
    using LibIntegrityState for IntegrityState;
    using LibStackTop for StackTop;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        uint inputs_ = Operand.unwrap(operand_) & 0x0F;
        uint outputs_ = (Operand.unwrap(operand_) >> 4) & 0x0F;
        return integrityState_.push(integrityState_.pop(stackTop_, inputs_), outputs_); 
    }

    function intern(VMState memory vmState_, Operand operand_, StackTop stackTop_) internal view returns (StackTop stackTopAfter_) {
        uint opcode_ = Operand.unwrap(operand_) >> 8;
        uint inputs_ = Operand.unwrap(operand_) & 0x0F;
        uint outputs_ = (Operand.unwrap(operand_) >> 4) & 0x0F;
        // Edge case is that we pull inputs right down to the bottom of the stack
        // in which case `head_` is the length slot of the stack itself. There is
        // no danger that we read outside the memory allocated to the stack from
        // the perspective of Solidity. `head_` will be restored as it was once
        // the dispatch is complete.
        (uint head_, uint[] memory tail_) = stackTop_.list(inputs_);
        uint[] memory vals_ = vmState_.extern.dispatch(opcode_, tail_);
        require(vals_.length == outputs_, "BAD_OUTPUTS_LENGTH");
        return stackTop_.down(inputs_).down().push(head_).push(vals_);
    }

    function extern(
        Operand,
        StackTop
    ) internal pure returns (StackTop) {
        revert("UNSUPPORTED");
    }
}