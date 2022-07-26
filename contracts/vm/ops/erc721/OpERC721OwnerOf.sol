// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpERC721OwnerOf
/// @notice Opcode for getting the current erc721 owner of an account.
library OpERC721OwnerOf {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 2));
    }

    // Stack the return of `ownerOf`.
    function ownerOf(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 token_,
            uint256 id_
        ) = stackTop_.popAndPeek();
        location_.set(
            uint256(uint160(IERC721(address(uint160(token_))).ownerOf(id_)))
        );
        return stackTopAfter_;
    }
}
