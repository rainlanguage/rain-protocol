// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./VMStateBuilder.sol";
import "./ops/AllStandardOps.sol";

contract StandardStateBuilder is VMStateBuilder {
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

    /// @inheritdoc VMStateBuilder
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
