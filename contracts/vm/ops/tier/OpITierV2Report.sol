// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/ITierV2.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";

import "hardhat/console.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.report` as an opcode.
library OpITierV2Report {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];

    function stackPops(uint256 operand_)
        internal
        pure
        returns (uint256 reportsLength_)
    {
        unchecked {
            reportsLength_ = operand_ + 2;
        }
    }

    // Stack the `report` returned by an `ITierV2` contract.
    function report(
        VMState memory,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop stackTopAfter_) {
        (uint256 account_, uint256[] memory context_) = stackTop_.list(
            operand_
        );
        stackTopAfter_ = context_.asStackTop();
        (StackTop location_, uint256 tierContract_) = stackTopAfter_.pop();
        location_.set(
            ITierV2(address(uint160(tierContract_))).report(
                address(uint160(account_)),
                context_
            )
        );
    }
}
