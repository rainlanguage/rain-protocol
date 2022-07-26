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
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_));
    }

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        override
        returns (
            function(IntegrityState memory, uint256, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, uint256, StackTop)
            view
            returns (StackTop)[]
            memory localIntegrityFunctionPointers_ = new function(
                IntegrityState memory,
                uint256,
                StackTop
            ) view returns (StackTop)[](LOCAL_OPS_LENGTH);
        localIntegrityFunctionPointers_[0] = integrityEvidenceDataApproved;
        return localIntegrityFunctionPointers_;
    }
}
