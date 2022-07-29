// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../../vm/integrity/StandardIntegrity.sol";
import "./AutoApprove.sol";
import "../../type/LibCast.sol";

contract AutoApproveStateBuilder is StandardIntegrity {
    using LibCast for function(uint256) pure returns (uint256)[];
    using LibIntegrityState for IntegrityState;

    function integrityEvidenceDataApproved(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        function(uint256) internal view returns (uint256) fn_;
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
