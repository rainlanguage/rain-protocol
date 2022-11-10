// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;
import "../run/RainInterpreter.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../../sstore2/SSTORE2.sol";
import "../run/LibStackTop.sol";
import "./LibIntegrityState.sol";
import "./IRainInterpreterIntegrity.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

abstract contract RainInterpreterIntegrity is IRainInterpreterIntegrity {
    using SafeCast for uint256;
    using Math for uint256;
    using LibInterpreterState for InterpreterState;
    using LibCast for uint256;
    using LibStackTop for bytes;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibIntegrityState for IntegrityState;

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        );

    function ensureIntegrity(
        StorageOpcodesRange memory storageOpcodesRange_,
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint256[] memory finalStacks_
    ) public view returns (uint256 contextReads_, uint256 stackLength_) {
        IntegrityState memory integrityState_ = IntegrityState(
            sources_,
            storageOpcodesRange_,
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
            integrityState_.contextReads,
            integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop)
        );
    }
}
