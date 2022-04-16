// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {State} from "../../RainVM.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/// @dev Opcode for `IERC20` `balanceOf`.
uint256 constant OPCODE_IERC20_BALANCE_OF = 0;
/// @dev Opcode for `IERC20` `totalSupply`.
uint256 constant OPCODE_IERC20_TOTAL_SUPPLY = 1;
/// @dev Number of provided opcodes for `IERC20Ops`.
uint256 constant IERC20_OPS_LENGTH = 2;

/// @title IERC20Ops
/// @notice RainVM opcode pack to read the IERC20 interface.
library IERC20Ops {
    function stackIndexDiff(uint256 opcode_, uint256)
        internal
        pure
        returns (int256)
    {
        if (opcode_ == OPCODE_IERC20_BALANCE_OF) {
            return -1;
        } else {
            return 0;
        }
    }

    // Stack the return of `balanceOf`.
    function balanceOf(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        console.log("balance of");
        uint256 location_;
        uint256 token_;
        uint256 account_;
        assembly {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            token_ := mload(location_)
            account_ := mload(stackTopLocation_)
        }
        uint256 balance_ = IERC20(address(uint160(token_))).balanceOf(
            address(uint160(account_))
        );
        assembly {
            mstore(location_, balance_)
        }
        return stackTopLocation_;
    }

    // Stack the return of `totalSupply`.
    function totalSupply(bytes memory, uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 token_;
        assembly {
            location_ := sub(stackTopLocation_, 0x20)
            token_ := mload(location_)
        }
        uint256 supply_ = IERC20(address(uint160(token_))).totalSupply();
        assembly {
            mstore(location_, supply_)
        }
        return stackTopLocation_;
    }
}
