// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./RainInterpreterIntegrity.sol";
import "../ops/AllStandardOps.sol";

contract StandardIntegrity is RainInterpreterIntegrity {
    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainInterpreterIntegrity
    function integrityFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.integrityFunctionPointers(
                localIntegrityFunctionPointers()
            );
    }
}
