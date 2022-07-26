// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/ITierV2.sol";
import "../../LibStackTop.sol";
import "../../LibVMState.sol";
import "../../LibIntegrityState.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.reportTimeForTier` as an opcode.
library OpITierV2ReportTimeForTier {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            return integrityState_.push(integrityState_.pop(stackTop_, operand_ + 3));
        }
    }

    // Stack the `reportTimeForTier` returned by an `ITierV2` contract.
    function reportTimeForTier(
        VMState memory,
        uint256 operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (uint256 tier_, uint256[] memory context_) = stackTop_.list(operand_);
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 tierContract_,
            uint256 account_
        ) = context_.asStackTop().popAndPeek();
        location_.set(
            ITierV2(address(uint160(tierContract_))).reportTimeForTier(
                address(uint160(account_)),
                tier_,
                context_
            )
        );
        return stackTopAfter_;
    }
}
