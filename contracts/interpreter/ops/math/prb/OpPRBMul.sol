// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import {UD60x18, mul} from "@prb/math/src/ud60x18/Math.sol";

library OpPRBMul {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return UD60x18.unwrap(mul(UD60x18.wrap(a_), UD60x18.wrap(b_)));
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
