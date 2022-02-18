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
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256
    ) internal view returns (uint256) {
        unchecked {
            require(opcode_ < OPS_LENGTH, "MAX_OPCODE");

            // Stack the return of `balanceOf`.
            if (opcode_ == BALANCE_OF) {
                uint256 location_;
                uint256 token_;
                uint256 account_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x40)
                    token_ := mload(location_)
                    account_ := mload(add(location_, 0x20))
                }
                uint256 balance_ = IERC20(address(uint160(token_))).balanceOf(
                    address(uint160(account_))
                );
                assembly {
                    mstore(location_, balance_)
                    stackTopLocation_ := add(location_, 0x20)
                }
            }
            // Stack the return of `totalSupply`.
            else if (opcode_ == TOTAL_SUPPLY) {
                uint256 location_;
                uint256 token_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x20)
                    token_ := mload(location_)
                }
                uint256 supply_ = IERC20(address(uint160(token_)))
                    .totalSupply();
                assembly {
                    mstore(location_, supply_)
                }
            }

            return stackTopLocation_;
        }
    }
}
