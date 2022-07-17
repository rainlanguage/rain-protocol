// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "../../../LibStackTop.sol";

/// @title OpERC20SnapshotTotalSupplyAt
/// @notice Opcode for Open Zeppelin `ERC20Snapshot.totalSupplyAt`.
/// https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot
library OpERC20SnapshotTotalSupplyAt {
    /// Stack `totalSupplyAt`.
    function totalSupplyAt(uint256, StackTop stackTopLocation_)
        internal
        view
        returns (StackTop)
    {
        uint256 location_;
        uint256 token_;
        uint256 snapshotId_;
        assembly ("memory-safe") {
            stackTopLocation_ := sub(stackTopLocation_, 0x20)
            location_ := sub(stackTopLocation_, 0x20)
            token_ := mload(location_)
            snapshotId_ := mload(stackTopLocation_)
        }
        uint256 totalSupply_ = ERC20Snapshot(address(uint160(token_)))
            .totalSupplyAt(snapshotId_);
        assembly ("memory-safe") {
            mstore(location_, totalSupply_)
        }
        return stackTopLocation_;
    }
}
