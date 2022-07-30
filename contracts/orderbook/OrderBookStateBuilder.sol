// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../vm/integrity/StandardIntegrity.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";
import "../type/LibCast.sol";

contract OrderBookStateBuilder is StandardIntegrity {
    using LibCast for function(uint256) pure returns (uint256)[];
    using LibIntegrityState for IntegrityState;

    function integrityOrderFundsCleared(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        integrityState_.scratch |= TRACKING_FLAG_CLEARED_ORDER;
        function(uint256) internal view returns (uint256) fn_;
        return integrityState_.applyFn(stackTop_, fn_);
    }

    function integrityOrderCounterpartyFundsCleared(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        integrityState_.scratch |= TRACKING_FLAG_CLEARED_COUNTERPARTY;
        function(uint256, uint256) internal view returns (uint256) fn_;
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
        localIntegrityFunctionPointers_[0] = integrityOrderFundsCleared;
        localIntegrityFunctionPointers_[
            1
        ] = integrityOrderCounterpartyFundsCleared;
        return localIntegrityFunctionPointers_;
    }
}
