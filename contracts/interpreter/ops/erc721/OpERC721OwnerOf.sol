// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../run/LibStackPointer.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpERC721OwnerOf
/// @notice Opcode for getting the current erc721 owner of an account.
library OpERC721OwnerOf {
    using LibStackPointer for StackPointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function _ownerOf(
        uint256 token_,
        uint256 id_
    ) internal view returns (uint256) {
        return uint256(uint160(IERC721(address(uint160(token_))).ownerOf(id_)));
    }

    function integrity(
        IntegrityCheckState memory integrityState_,
        Operand,
        StackPointer stackTop_
    ) internal pure returns (StackPointer) {
        return integrityState_.applyFn(stackTop_, _ownerOf);
    }

    // Stack the return of `ownerOf`.
    function ownerOf(
        InterpreterState memory,
        Operand,
        StackPointer stackTop_
    ) internal view returns (StackPointer) {
        return stackTop_.applyFn(_ownerOf);
    }
}
