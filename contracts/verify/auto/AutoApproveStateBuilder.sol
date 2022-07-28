// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../../vm/StandardStateBuilder.sol";
import "./AutoApprove.sol";
import "../../type/LibCast.sol";

contract AutoApproveStateBuilder is StandardStateBuilder {
    using LibCast for function(uint256) pure returns (uint256)[];
    using LibIntegrityState for IntegrityState;

    function integrityEvidenceDataApproved(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        function(uint) internal view returns (uint) fn_;
        return integrityState_.applyFn(stackTop_, fn_);
    }

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        override
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory localIntegrityFunctionPointers_ = new function(
                IntegrityState memory,
                Operand,
                StackTop
            ) view returns (StackTop)[](LOCAL_OPS_LENGTH);
        localIntegrityFunctionPointers_[0] = integrityEvidenceDataApproved;
        return localIntegrityFunctionPointers_;
    }
}
