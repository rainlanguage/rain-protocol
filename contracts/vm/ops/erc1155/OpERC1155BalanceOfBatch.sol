// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../runtime/LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../../type/LibCast.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpERC1155BalanceOfBatch
/// @notice Opcode for getting the current erc1155 balance of an accounts batch.
library OpERC1155BalanceOfBatch {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibCast for uint256[];
    using LibIntegrityState for IntegrityState;

    function _balanceOfBatch(uint token_, uint[] memory accounts_, uint[] memory ids_) internal view returns (uint[] memory) {
        return IERC1155(address(uint160(token_))).balanceOfBatch(accounts_.asAddresses(), ids_);
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _balanceOfBatch, Operand.unwrap(operand_));
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function balanceOfBatch(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_balanceOfBatch, Operand.unwrap(operand_));
    }
}
