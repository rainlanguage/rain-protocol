// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "../../../tier/ITierV2.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.report` as an opcode.
library OpITierV2Report {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibPointer for uint256[];
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        uint256 tierContract_,
        uint256 account_,
        uint256[] memory context_
    ) internal view returns (uint256) {
        return
            ITierV2(address(uint160(tierContract_))).report(
                address(uint160(account_)),
                context_
            );
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand operand_,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return
            integrityCheckState_.applyFn(
                stackTop_,
                f,
                Operand.unwrap(operand_)
            );
    }

    // Stack the `report` returned by an `ITierV2` contract.
    function run(
        InterpreterState memory,
        Operand operand_,
        Pointer stackTop_
    ) internal view returns (Pointer stackTopAfter_) {
        return stackTop_.applyFn(f, Operand.unwrap(operand_));
    }
}
