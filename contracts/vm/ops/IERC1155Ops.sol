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
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256
    ) internal view returns (uint256) {
        unchecked {
            // Stack the return of `balanceOf`.
            if (opcode_ == BALANCE_OF) {
                uint256 location_;
                uint256 token_;
                uint256 account_;
                uint256 id_;
                assembly {
                    location_ := sub(stackTopLocation_, 0x60)
                    token_ := mload(location_)
                    account_ := mload(add(location_, 0x20))
                    id_ := mload(add(location_, 0x40))
                }
                uint256 result_ = IERC1155(address(uint160(token_))).balanceOf(
                    address(uint160(account_)),
                    id_
                );
                assembly {
                    mstore(location_, result_)
                    stackTopLocation_ := add(location_, 0x20)
                }
            }
            // Stack the return of `balanceOfBatch`.
            // Operand will be the length
            else if (opcode_ == BALANCE_OF_BATCH) {
                // uint256 len_ = operand_ + 1;
                // address[] memory addresses_ = new address[](len_);
                // uint256[] memory ids_ = new uint256[](len_);
                // // Consumes (2 * len_ + 1) inputs and produces len_ outputs.
                // state_.stackIndex = state_.stackIndex - (len_ + 1);
                // uint256 baseIndex_ = state_.stackIndex - len_;
                // IERC1155 token_ = IERC1155(
                //     address(uint160(state_.stack[baseIndex_]))
                // );
                // for (uint256 i_ = 0; i_ < len_; i_++) {
                //     addresses_[i_] = address(
                //         uint160(state_.stack[baseIndex_ + i_ + 1])
                //     );
                //     ids_[i_] = state_.stack[baseIndex_ + len_ + i_ + 1];
                // }
                // uint256[] memory balances_ = token_.balanceOfBatch(
                //     addresses_,
                //     ids_
                // );
                // for (uint256 i_ = 0; i_ < len_; i_++) {
                //     state_.stack[baseIndex_ + i_] = balances_[i_];
                // }
            }
            return stackTopLocation_;
        }
    }
}
