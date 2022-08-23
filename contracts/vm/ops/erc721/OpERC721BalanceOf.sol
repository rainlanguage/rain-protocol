// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";
import "../../external/LibExternalDispatch.sol";

/// @title OpERC721BalanceOf
/// @notice Opcode for getting the current erc721 balance of an account.
library OpERC721BalanceOf {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _balanceOf(uint256 token_, uint256 account_)
        internal
        view
        returns (uint256)
    {
        return
            IERC721(address(uint160(token_))).balanceOf(
                address(uint160(account_))
            );
    }

    // function integrity(
    //     IntegrityState memory integrityState_,
    //     Operand,
    //     StackTop stackTop_
    // ) internal pure returns (StackTop) {
    //     return integrityState_.applyFn(stackTop_, _balanceOf);
    // }

    // // Stack the return of `balanceOf`.
    // function intern(
    //     VMState memory,
    //     Operand,
    //     StackTop stackTop_
    // ) internal view returns (StackTop) {
    //     return stackTop_.applyFn(_balanceOf);
    // }

    // function extern(uint256[] memory inputs_)
    //     internal
    //     view
    //     returns (uint256[] memory)
    // {
    //     return inputs_.applyFn(_balanceOf);
    // }
}
