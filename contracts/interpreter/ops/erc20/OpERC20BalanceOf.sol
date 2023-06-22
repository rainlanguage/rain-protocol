// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/LibInterpreterState.sol";
import "rain.interpreter/lib/LibOp.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpERC20BalanceOf
/// @notice Opcode for ERC20 `balanceOf`.
library OpERC20BalanceOf {
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;
    using LibOp for Pointer;

    function f(
        uint256 token_,
        uint256 account_
    ) internal view returns (uint256) {
        return
            IERC20(address(uint160(token_))).balanceOf(
                address(uint160(account_))
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
