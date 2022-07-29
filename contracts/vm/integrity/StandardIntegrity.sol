// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./RainVMIntegrity.sol";
import "../ops/AllStandardOps.sol";

contract StandardIntegrity is RainVMIntegrity {
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

    /// @inheritdoc RainVMIntegrity
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
