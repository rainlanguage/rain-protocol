// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../../LibStackTop.sol";

/// @title OpERC721OwnerOf
/// @notice Opcode for getting the current erc721 owner of an account.
library OpERC721OwnerOf {
    // Stack the return of `ownerOf`.
    function ownerOf(uint256, StackTop stackTopLocation_)
        internal
        view
        returns (StackTop)
    {
        uint256 location_;
        uint256 token_;
        uint256 id_;

        assembly ("memory-safe") {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            token_ := mload(location_)
            id_ := mload(stackTopLocation_)
        }
        uint256 owner_ = uint256(
            uint160(IERC721(address(uint160(token_))).ownerOf(id_))
        );
        assembly ("memory-safe") {
            mstore(location_, owner_)
        }
        return stackTopLocation_;
    }
}
