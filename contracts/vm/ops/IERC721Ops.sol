// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../RainVM.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title IERC721Ops
/// @notice RainVM opcode pack to read the IERC721 interface.
library IERC721Ops {
    /// Opcode for `IERC721` `balanceOf`.
    uint256 private constant BALANCE_OF = 0;
    /// Opcode for `IERC721` `ownerOf`.
    uint256 private constant OWNER_OF = 1;
    /// Number of provided opcodes for `IERC721Ops`.
    uint256 internal constant OPS_LENGTH = 2;

    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            state_.stackIndex--;
            // Stack the return of `balanceOf`.
            if (opcode_ == BALANCE_OF) {
                state_.stack[state_.stackIndex - 1] = IERC721(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).balanceOf(address(uint160(state_.stack[state_.stackIndex])));
            }
            // Stack the return of `ownerOf`.
            else if (opcode_ == OWNER_OF) {
                state_.stack[state_.stackIndex - 1] = uint256(
                    uint160(
                        IERC721(
                            address(
                                uint160(state_.stack[state_.stackIndex - 1])
                            )
                        ).ownerOf(state_.stack[state_.stackIndex])
                    )
                );
            }
        }
    }
}
