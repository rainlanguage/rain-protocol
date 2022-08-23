// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../tier/ITierV2.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.reportTimeForTier` as an opcode.
library OpITierV2ReportTimeForTier {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibIntegrityState for IntegrityState;

    function _reportTimeForTier(
        uint256 tierContract_,
        uint256 account_,
        uint256 tier_,
        uint256[] memory context_
    ) internal view returns (uint256) {
        return
            ITierV2(address(uint160(tierContract_))).reportTimeForTier(
                address(uint160(account_)),
                tier_,
                context_
            );
    }

    // function integrity(
    //     IntegrityState memory integrityState_,
    //     Operand operand_,
    //     StackTop stackTop_
    // ) internal pure returns (StackTop) {
    //     return
    //         integrityState_.apply(
    //             stackTop_,
    //             _reportTimeForTier,
    //             Operand.unwrap(operand_)
    //         );
    // }

    // // Stack the `reportTimeForTier` returned by an `ITierV2` contract.
    // function intern(
    //     VMState memory,
    //     Operand operand_,
    //     StackTop stackTop_
    // ) internal view returns (StackTop) {
    //     return stackTop_.apply(_reportTimeForTier, Operand.unwrap(operand_));
    // }

    // function extern(uint256[] memory inputs_)
    //     internal
    //     view
    //     returns (uint256[] memory)
    // {
    //     return inputs_.apply(_reportTimeForTier);
    // }
}
