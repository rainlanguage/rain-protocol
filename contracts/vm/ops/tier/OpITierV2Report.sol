// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../../../tier/ITierV2.sol";

/// @title OpITierV2Report
/// @notice Exposes `ITierV2.report` as an opcode.
library OpITierV2Report {
    // Stack the report returned by an `ITierV2` contract.
    // Top two stack vals are used as the address and `ITierV2` contract
    // to check against.
    function report(uint256 operand_, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 tier_;
        uint256 account_;
        bytes memory data_;
        assembly {
            let dataLen_ := mul(operand_, 0x20)
            stackTopLocation_ := sub(stackTopLocation_, add(0x20, dataLen_))
            location_ := sub(stackTopLocation_, 0x20)
            tier_ := mload(location_)
            account_ := mload(stackTopLocation_)
            // we can reuse the account_ as the length for data_ and achieve a
            // near zero-cost bytes array to send to `report`.
            mstore(stackTopLocation_, dataLen_)
            data_ := stackTopLocation_
        }
        uint256 report_ = ITierV2(address(uint160(tier_))).report(
            address(uint160(account_)),
            data_
        );
        assembly {
            mstore(location_, report_)
        }
        return stackTopLocation_;
    }
}
