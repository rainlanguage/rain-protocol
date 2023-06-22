// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import "../../../../verify/IVerifyV1.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibOp.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityCheck.sol";

/// @title OpIVerifyV1AccountStatusAtTime
/// @notice Opcode for IVerifyV1 `accountStatusAtTime`.
library OpIVerifyV1AccountStatusAtTime {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        uint256 contract_,
        uint256 account_,
        uint256 timestamp_
    ) internal view returns (uint256) {
        return
            VerifyStatus.unwrap(
                IVerifyV1(address(uint160(contract_))).accountStatusAtTime(
                    address(uint160(account_)),
                    timestamp_
                )
            );
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    /// Stack `token`.
    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
