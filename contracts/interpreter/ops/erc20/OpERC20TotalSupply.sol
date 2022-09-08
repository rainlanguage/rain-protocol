// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../integrity/LibIntegrity.sol";

/// @title OpERC20TotalSupply
/// @notice Opcode for ERC20 `totalSupply`.
library OpERC20TotalSupply {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function _totalSupply(uint256 token_) internal view returns (uint256) {
        return IERC20(address(uint160(token_))).totalSupply();
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _totalSupply);
    }

    // Stack the return of `totalSupply`.
    function totalSupply(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_totalSupply);
    }
}
