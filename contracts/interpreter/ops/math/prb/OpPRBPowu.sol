// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "../../../deploy/LibIntegrityCheck.sol";
import "rain.lib.interpreter/LibInterpreterState.sol";
import "rain.lib.interpreter/LibOp.sol";
import {UD60x18, powu} from "@prb/math/src/ud60x18/Math.sol";

library OpPRBPowu {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return UD60x18.unwrap(powu(UD60x18.wrap(a_), b_));
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
