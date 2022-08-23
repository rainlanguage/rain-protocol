// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";
import "../../external/LibExternalDispatch.sol";

/// @title OpERC721OwnerOf
/// @notice Opcode for getting the current erc721 owner of an account.
library OpERC721OwnerOf {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _ownerOf(uint256 token_, uint256 id_)
        internal
        view
        returns (uint256)
    {
        return uint256(uint160(IERC721(address(uint160(token_))).ownerOf(id_)));
    }

    // function integrity(
    //     IntegrityState memory integrityState_,
    //     Operand,
    //     StackTop stackTop_
    // ) internal pure returns (StackTop) {
    //     return integrityState_.applyFn(stackTop_, _ownerOf);
    // }

    // // Stack the return of `ownerOf`.
    // function intern(
    //     VMState memory,
    //     Operand,
    //     StackTop stackTop_
    // ) internal view returns (StackTop) {
    //     return stackTop_.applyFn(_ownerOf);
    // }

    // function extern(uint256[] memory inputs_)
    //     internal
    //     view
    //     returns (uint256[] memory)
    // {
    //     return inputs_.applyFn(_ownerOf);
    // }
}
