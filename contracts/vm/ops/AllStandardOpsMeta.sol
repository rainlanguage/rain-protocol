// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../VMStateBuilder.sol";
import "./AllStandardOps.sol";

contract AllStandardOpsMeta is VMStateBuilder {
    /// @inheritdoc VMStateBuilder
    function stackIndexMoveFnPtrs()
        public
        pure
        override
        returns (bytes memory)
    {
        return AllStandardOps.stackIndexMoveFnPtrs();
    }
}
