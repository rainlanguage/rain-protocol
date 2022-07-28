// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../LibStackTop.sol";
import "../../../array/LibUint256Array.sol";
import "../../../type/LibCast.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpERC1155BalanceOfBatch
/// @notice Opcode for getting the current erc1155 balance of an accounts batch.
library OpERC1155BalanceOfBatch {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibCast for uint256[];
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            require(Operand.unwrap(operand_) > 0, "0_ERC1155_BATCH");
            return
                integrityState_.push(
                    integrityState_.pop(
                        stackTop_,
                        (2 * Operand.unwrap(operand_)) + 1
                    )
                );
        }
    }

    // Stack the return of `balanceOfBatch`.
    // Operand will be the length
    function balanceOfBatch(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        StackTop idsStart_ = stackTop_.down(Operand.unwrap(operand_));
        uint256[] memory ids_ = LibUint256Array.copyToNewUint256Array(
            StackTop.unwrap(idsStart_),
            Operand.unwrap(operand_)
        );
        (uint256 token_, uint256[] memory addresses_) = idsStart_.list(
            Operand.unwrap(operand_)
        );

        uint256[] memory balances_ = IERC1155(address(uint160(token_)))
            .balanceOfBatch(addresses_.asAddresses(), ids_);
        LibUint256Array.unsafeCopyValuesTo(
            balances_,
            StackTop.unwrap(addresses_.asStackTop())
        );
        return addresses_.asStackTop().up(Operand.unwrap(operand_));
    }
}
