// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title IERC1155Ops
/// @notice RainVM opcode pack to read the IERC1155 interface.
library IERC1155Ops {
    /// Opcode for `IERC1155` `balanceOf`.
    uint256 private constant BALANCE_OF = 0;
    /// Opcode for `IERC1155` `balanceOfBatch`.
    uint256 private constant BALANCE_OF_BATCH = 1;
    /// Number of provided opcodes for `IERC1155Ops`.
    uint256 internal constant OPS_LENGTH = 2;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            // Stack the return of `balanceOf`.
            if (opcode_ == BALANCE_OF) {
                state_.stackIndex = state_.stackIndex - 2;
                state_.stack[state_.stackIndex - 1] = IERC1155(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).balanceOf(
                        address(uint160(state_.stack[state_.stackIndex - 1])),
                        state_.stack[state_.stackIndex]
                    );
            }
            // Stack the return of `balanceOfBatch`.
            // Operand will be the length
            else if (opcode_ == BALANCE_OF_BATCH) {
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
