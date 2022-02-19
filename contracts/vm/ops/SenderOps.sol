// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {State} from "../RainVM.sol";

/// @title SenderOps
/// @notice RainVM opcode pack to access `msg.sender`.
library SenderOps {
    /// Number of provided opcodes for `SenderOps`.
    uint256 internal constant OPS_LENGTH = 1;

    function applyOp(
        bytes memory,
        uint256 stackTopLocation_,
        uint256,
        uint256
    ) internal view returns (uint256) {
        unchecked {
            // There's only one opcode.
            // Stack the current `msg.sender`.
            // @todo - is this the same as `caller()` in yul?
            uint256 sender_ = uint256(uint160(msg.sender));
            assembly {
                mstore(stackTopLocation_, sender_)
                stackTopLocation_ := add(stackTopLocation_, 0x20)
            }
            return stackTopLocation_;
        }
    }
}
