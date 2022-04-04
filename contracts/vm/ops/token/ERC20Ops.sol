// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";

/// @dev Opcode for `IERC20.balanceOf`.
uint256 constant OPCODE_BALANCE_OF = 0;
/// @dev Opcode for `IERC20.totalSupply`.
uint256 constant OPCODE_TOTAL_SUPPLY = 1;
/// @dev Opcode for Open Zeppelin `ERC20Snapshot.balanceOfAt`.
uint256 constant OPCODE_BALANCE_OF_AT = 2;
/// @dev Opcode for Open Zeppelin `ERC20Snapshot.totalSupplyAt`.
uint256 constant OPCODE_TOTAL_SUPPLY_AT = 3;
/// @dev Number of provided opcodes for `IERC20Ops`.
uint256 constant ERC20_OPS_LENGTH = 4;

/// @title IERC20Ops
/// @notice RainVM opcode pack to read the IERC20 interface.
library ERC20Ops {
    function applyOp(
        State memory state_,
        uint256 opcode_,
        uint256
    ) internal view {
        unchecked {
            require(opcode_ < ERC20_OPS_LENGTH, "MAX_OPCODE");

            // Stack the return of `balanceOf`.
            if (opcode_ == OPCODE_BALANCE_OF) {
                state_.stackIndex--;
                state_.stack[state_.stackIndex - 1] = IERC20(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).balanceOf(address(uint160(state_.stack[state_.stackIndex])));
            }
            // Stack the return of `totalSupply`.
            else if (opcode_ == OPCODE_TOTAL_SUPPLY) {
                state_.stack[state_.stackIndex - 1] = IERC20(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).totalSupply();
            }
            // Stack the return of `ERC20Snapshot.balanceOfAt`.
            else if (opcode_ == OPCODE_BALANCE_OF_AT) {
                state_.stackIndex -= 2;
                state_.stack[state_.stackIndex - 1] = ERC20Snapshot(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).balanceOfAt(
                        address(uint160(state_.stack[state_.stackIndex])),
                        state_.stack[state_.stackIndex + 1]
                    );
            }
            // Stack the return of `ERC20Snapshot.totalSupplyAt`.
            else if (opcode_ == OPCODE_TOTAL_SUPPLY_AT) {
                state_.stackIndex--;
                state_.stack[state_.stackIndex - 1] = ERC20Snapshot(
                    address(uint160(state_.stack[state_.stackIndex - 1]))
                ).totalSupplyAt(state_.stack[state_.stackIndex]);
            }
        }
    }
}
