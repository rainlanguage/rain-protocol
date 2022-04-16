// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../VMMeta.sol";
import "./AllStandardOps.sol";

contract AllStandardOpsMeta is VMMeta {
    /// @inheritdoc VMMeta
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        public
        pure
        override
        returns (int256)
    {
        return AllStandardOps.stackIndexDiff(opcode_, operand_);
    }
}
