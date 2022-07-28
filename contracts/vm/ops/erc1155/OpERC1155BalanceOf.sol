// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpERC1155BalanceOf
/// @notice Opcode for getting the current erc1155 balance of an account.
library OpERC1155BalanceOf {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _balanceOf(
        uint256 token_,
        uint256 account_,
        uint256 id_
    ) internal view returns (uint256) {
        return
            IERC1155(address(uint160(token_))).balanceOf(
                address(uint160(account_)),
                id_
            );
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _balanceOf);
    }

    // Stack the return of `balanceOf`.
    function balanceOf(
        VMState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_balanceOf);
    }
}
