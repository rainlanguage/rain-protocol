// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {ERC20SnapshotUpgradeable as ERC20Snapshot} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../integrity/LibIntegrityState.sol";

/// @title OpERC20SnapshotBalanceOfAt
/// @notice Opcode for Open Zeppelin `ERC20Snapshot.balanceOfAt`.
/// https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot
library OpERC20SnapshotBalanceOfAt {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function _balanceOfAt(
        uint256 token_,
        uint256 account_,
        uint256 snapshotId_
    ) internal view returns (uint256) {
        return
            ERC20Snapshot(address(uint160(token_))).balanceOfAt(
                address(uint160(account_)),
                snapshotId_
            );
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _balanceOfAt);
    }

    /// Stack `balanceOfAt`.
    function balanceOfAt(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_balanceOfAt);
    }
}
