// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import {UD60x18, floor} from "@prb/math/src/ud60x18/Math.sol";

library OpPRBFloor {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 a_) internal pure returns (uint256) {
        return UD60x18.unwrap(floor(UD60x18.wrap(a_)));
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
