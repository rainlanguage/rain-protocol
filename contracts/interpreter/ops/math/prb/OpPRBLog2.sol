// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "../../../deploy/LibIntegrityCheck.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import {UD60x18, log2} from "@prb/math/src/ud60x18/Math.sol";

library OpPRBLog2 {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_) internal pure returns (uint256) {
        return UD60x18.unwrap(log2(UD60x18.wrap(a_)));
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
