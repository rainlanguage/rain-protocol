// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;
import "../vm/integrity/StandardIntegrity.sol";
import "../vm/ops/AllStandardOps.sol";
import "../type/LibCast.sol";
import "../idempotent/LibIdempotentFlag.sol";
uint256 constant FLAG_INDEX_FLOW_TIME = 0;
uint constant LOCAL_OPS_LENGTH = 1;

contract OrderBookIntegrity is StandardIntegrity {
    using LibCast for function(uint256) pure returns (uint256)[];
    using LibIntegrityState for IntegrityState;
    using LibIdempotentFlag for IdempotentFlag;

    function integrityFlowTime(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        integrityState_.scratch = IdempotentFlag.unwrap(IdempotentFlag.wrap(integrityState_.scratch).set(FLAG_INDEX_FLOW_TIME));
        function(uint, uint) internal view returns (uint) fn_;
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
        localIntegrityFunctionPointers_[0] = integrityFlowTime;
        return localIntegrityFunctionPointers_;
    }
}
