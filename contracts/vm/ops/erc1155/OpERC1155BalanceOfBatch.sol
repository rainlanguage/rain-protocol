// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../../type/LibCast.sol";

import "hardhat/console.sol";

/// @title OpERC1155BalanceOfBatch
/// @notice Opcode for getting the current erc1155 balance of an accounts batch.
library OpERC1155BalanceOfBatch {
    using LibStackTop for StackTop;
    using LibStackTop for uint[];
    using LibCast for uint[];

    function stackPops(uint256 operand_) internal pure returns (uint256) {
        unchecked {
            require(operand_ > 0, "0_OPERAND_ERC1155");
            return (operand_ * 2) + 1;
        }
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function balanceOfBatch(uint256 operand_, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        StackTop idsStart_ = stackTop_.down(operand_);
        uint[] memory ids_ = LibUint256Array.unsafeCopyValuesToNewArray(StackTop.unwrap(idsStart_), operand_);
        (uint token_, uint[] memory addresses_) = idsStart_.list(operand_);

        uint256[] memory balances_ = IERC1155(address(uint160(token_)))
            .balanceOfBatch(addresses_.asAddresses(), ids_);
        LibUint256Array.unsafeCopyValuesTo(balances_, StackTop.unwrap(addresses_.asStackTop()));
        return addresses_.asStackTop().up(operand_);
    }
}
