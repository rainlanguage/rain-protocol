// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../verify/IVerifyV1.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpIVerifyV1AccountStatusAtTime
/// @notice Opcode for IVerifyV1 `accountStatusAtTime`.
library OpIVerifyV1AccountStatusAtTime {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function f(
        uint contract_,
        uint256 account_,
        uint timestamp_
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
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, f);
    }

    /// Stack `token`.
    function run(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(f);
    }
}
