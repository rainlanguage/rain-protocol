// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpERC20BalanceOf
/// @notice Opcode for ERC20 `balanceOf`.
library OpERC20BalanceOf {
    using LibStackTop for StackTop;

    /// Stack `balanceOf`.
    function balanceOf(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 token_,
            uint256 account_
        ) = stackTop_.popAndPeek();
        location_.set(
            IERC20(address(uint160(token_))).balanceOf(
                address(uint160(account_))
            )
        );
        return stackTopAfter_;
    }
}
