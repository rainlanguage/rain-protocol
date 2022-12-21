// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../ops/AllStandardOps.sol";

contract StandardIntegrity {
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

    function integrityFunctionPointers()
        internal
        view
        virtual
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
