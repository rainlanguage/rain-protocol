// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";

/// @title OpERC20TotalSupply
/// @notice Opcode for ERC20 `totalSupply`.
library OpERC20TotalSupply {
    using LibStackTop for StackTop;

    // Stack the return of `totalSupply`.
    function totalSupply(uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        // uint256 location_;
        // uint256 token_;
        // assembly ("memory-safe") {
        //     location_ := sub(stackTop_, 0x20)
        //     token_ := mload(location_)
        // }
        (StackTop peek_, uint token_) = stackTop_.peek();
        peek_.set(
            IERC20(address(uint160(token_))).totalSupply()
        );
        // return stackTop_;
        // assembly ("memory-safe") {
        //     mstore(location_, supply_)
        // }
        return stackTop_;
    }
}
