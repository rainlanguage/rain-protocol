// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../ops/AllStandardOps.sol";
import "./LibIntegrity.sol";

contract StandardInterpreterIntegrity {
    using LibIntegrity for IntegrityState;
    using LibStackTop for StackTop;

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

    function ensureIntegrity(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256[] memory finalStacks_
    ) external view returns (uint256 scratch_, uint256 stackLength_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_,
            constantsLength_,
            0,
            StackTop.wrap(0),
            StackTop.wrap(0),
            0,
            integrityFunctionPointers()
        );
        for (uint256 i_ = 0; i_ < finalStacks_.length; i_++) {
            integrityState_.ensureIntegrity(
                SourceIndex.wrap(i_),
                StackTop.wrap(0),
                finalStacks_[i_]
            );
        }
        return (
            integrityState_.scratch,
            integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop)
        );
    }
}
