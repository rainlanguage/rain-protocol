// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "../../../LibStackTop.sol";
import "../../../LibVMState.sol";

/// @title OpERC20SnapshotBalanceOfAt
/// @notice Opcode for Open Zeppelin `ERC20Snapshot.balanceOfAt`.
/// https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot
library OpERC20SnapshotBalanceOfAt {
    using LibStackTop for StackTop;

    /// Stack `balanceOfAt`.
    function balanceOfAt(
        VMState memory,
        uint256,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        (
            StackTop location_,
            StackTop stackTopAfter_,
            uint256 token_,
            uint256 account_,
            uint256 snapshotId_
        ) = stackTop_.pop2AndPeek();

        location_.set(
            ERC20Snapshot(address(uint160(token_))).balanceOfAt(
                address(uint160(account_)),
                snapshotId_
            )
        );
        return stackTopAfter_;
    }
}
