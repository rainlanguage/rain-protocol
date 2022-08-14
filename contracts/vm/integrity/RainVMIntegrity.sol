// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;
import "../runtime/RainVM.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../sstore2/SSTORE2.sol";
import "../runtime/LibStackTop.sol";
import "./LibIntegrityState.sol";
import "./IRainVMIntegrity.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

abstract contract RainVMIntegrity is IRainVMIntegrity {
    using SafeCast for uint256;
    using Math for uint256;
    using LibVMState for VMState;
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
    ) external view returns (uint256 stackLength_, uint256 scratch_) {
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
            integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop),
            integrityState_.scratch
        );
    }
}
