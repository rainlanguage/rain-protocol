// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpERC1155BalanceOf
/// @notice Opcode for getting the current erc1155 balance of an account.
library OpERC1155BalanceOf {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return integrityState_.push(integrityState_.pop(stackTop_, 3));
    }

    // Stack the return of `balanceOf`.
    function balanceOf(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 token_,
            uint256 account_,
            uint256 id_
        ) = stackTop_.pop2AndPeek();

        location_.set(
            IERC1155(address(uint160(token_))).balanceOf(
                address(uint160(account_)),
                id_
            )
        );
        return stackTopAfter_;
    }
}
