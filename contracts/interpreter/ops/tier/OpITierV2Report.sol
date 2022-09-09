// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/ITierV2.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../deploy/LibIntegrity.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.report` as an opcode.
library OpITierV2Report {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibIntegrity for IntegrityState;

    function _report(
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
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return
            integrityState_.applyFn(
                stackTop_,
                _report,
                Operand.unwrap(operand_)
            );
    }

    // Stack the `report` returned by an `ITierV2` contract.
    function report(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        return stackTop_.applyFn(_report, Operand.unwrap(operand_));
    }
}
