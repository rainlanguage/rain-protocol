// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import "../../../LibStackTop.sol";
import "../../../../type/LibCast.sol";

/// @title OpGreaterThan
/// @notice Opcode to compare the top two stack values.
library OpGreaterThan {
    using LibCast for bool;
    using LibStackTop for StackTop;

    function greaterThan(uint256, StackTop stackTop_)
        internal
        pure
        returns (StackTop)
    {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 a_,
            uint256 b_
        ) = stackTop_.popAndPeek();
        location_.set((a_ > b_).asUint256());
        return stackTopAfter_;
    }
}
