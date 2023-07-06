// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpERC721BalanceOf
/// @notice Opcode for getting the current erc721 balance of an account.
library OpERC721BalanceOf {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        uint256 token_,
        uint256 account_
    ) internal view returns (uint256) {
        return
            IERC721(address(uint160(token_))).balanceOf(
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
