// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "../../../ierc5313/IERC5313.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";

/// @title OpERC5313Owner
/// @notice Opcode for ERC5313 `owner`.
library OpERC5313Owner {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(uint256 contract_) internal view returns (uint256) {
        return
            uint256(
                uint160(address(EIP5313(address(uint160(contract_))).owner()))
            );
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
