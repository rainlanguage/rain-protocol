// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @dev Opcode for `IERC721` `balanceOf`.
uint256 constant OPCODE_IERC721_BALANCE_OF = 0;
/// @dev Opcode for `IERC721` `ownerOf`.
uint256 constant OPCODE_IERC721_OWNER_OF = 1;
/// @dev Number of provided opcodes for `IERC721Ops`.
uint256 constant IERC721_OPS_LENGTH = 2;

/// @title IERC721Ops
/// @notice RainVM opcode pack to read the IERC721 interface.
library IERC721Ops {
    function stackIndexDiff(uint256, uint256) internal pure returns (int256) {
        return -1;
    }

            // Stack the return of `balanceOf`.
    function balanceOf(uint, uint stackTopLocation_) internal view returns (uint) {
                uint256 location_;
                uint256 token_;
                uint256 account_;

                assembly {
                    stackTopLocation_ := sub(stackTopLocation_, 0x20)
                    location_ := sub(stackTopLocation_, 0x20)
                    token_ := mload(location_)
                    account_ := mload(stackTopLocation_)
                }
                uint256 balance_ = IERC721(address(uint160(token_))).balanceOf(
                    address(uint160(account_))
                );

                assembly {
                    mstore(location_, balance_)
                }
                return stackTopLocation_;
    }

            // Stack the return of `ownerOf`.
    function ownerOf(uint, uint stackTopLocation_) internal view returns (uint) {
                        uint256 location_;
                uint256 token_;
                uint256 id_;

                assembly {
                    stackTopLocation_ := sub(stackTopLocation_, 0x20)
                    location_ := sub(stackTopLocation_, 0x20)
                    token_ := mload(location_)
                    id_ := mload(stackTopLocation_)
                }
                uint256 owner_ = uint256(
                    uint160(IERC721(address(uint160(token_))).ownerOf(id_))
                );
                assembly {
                    mstore(location_, owner_)
                }
                return stackTopLocation_;
    }

}
