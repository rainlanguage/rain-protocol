// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

/// @title OpERC721BalanceOf
/// @notice Opcode for getting the current erc721 balance of an account.
library OpERC721BalanceOf {
    using LibStackTop for StackTop;

    // Stack the return of `balanceOf`.
    function balanceOf(VMState memory, uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 token_,
            uint256 account_
        ) = stackTop_.popAndPeek();
        location_.set(
            IERC721(address(uint160(token_))).balanceOf(
                address(uint160(account_))
            )
        );
        return stackTopAfter_;
    }
}
