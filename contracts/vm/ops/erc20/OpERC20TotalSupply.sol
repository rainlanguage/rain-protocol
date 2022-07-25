// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpERC20TotalSupply
/// @notice Opcode for ERC20 `totalSupply`.
library OpERC20TotalSupply {
    using LibStackTop for StackTop;

    // Stack the return of `totalSupply`.
    function totalSupply(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (StackTop location_, uint256 token_) = stackTop_.pop();
        location_.set(IERC20(address(uint160(token_))).totalSupply());
        return stackTop_;
    }
}
