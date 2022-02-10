// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IERC20Ops
/// @notice RainVM opcode pack to read the IERC20 interface.
library IERC20Ops {
    /// Opcode for `IERC20` `balanceOf`.
    uint256 private constant BALANCE_OF = 0;
    /// Opcode for `IERC20` `totalSupply`.
    uint256 private constant TOTAL_SUPPLY = 1;
    /// Number of provided opcodes for `IERC20Ops`.
    uint256 internal constant OPS_LENGTH = 2;

    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            // Stack the return of `balanceOf`.
            if (opcode_ == BALANCE_OF) {
                state_.stackIndex--;
                state_.stack[state_.stackIndex - 1] = IERC20(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).balanceOf(address(uint160(state_.stack[state_.stackIndex])));
            }
            // Stack the return of `totalSupply`.
            else if (opcode_ == TOTAL_SUPPLY) {
                state_.stack[state_.stackIndex - 1] = IERC20(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).totalSupply();
            }
        }
    }
}
