// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../LibStackTop.sol";
import "../../LibInterpreter.sol";
import "../../deploy/LibIntegrity.sol";

/// @title OpERC721BalanceOf
/// @notice Opcode for getting the current erc721 balance of an account.
library OpERC721BalanceOf {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function _balanceOf(uint256 token_, uint256 account_)
        internal
        view
        returns (uint256)
    {
        return
            IERC721(address(uint160(token_))).balanceOf(
                address(uint160(account_))
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
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_balanceOf);
    }
}
