// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {ERC20SnapshotUpgradeable as ERC20Snapshot} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../../../LibStackTop.sol";
import "../../../LibInterpreter.sol";
import "../../../deploy/LibIntegrity.sol";

/// @title OpERC20SnapshotTotalSupplyAt
/// @notice Opcode for Open Zeppelin `ERC20Snapshot.totalSupplyAt`.
/// https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot
library OpERC20SnapshotTotalSupplyAt {
    using LibStackTop for StackTop;
    using LibIntegrity for IntegrityState;

    function _totalSupplyAt(uint256 token_, uint256 snapshotId_)
        internal
        view
        returns (uint256)
    {
        return
            ERC20Snapshot(address(uint160(token_))).totalSupplyAt(snapshotId_);
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, _totalSupplyAt);
    }

    /// Stack `totalSupplyAt`.
    function totalSupplyAt(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(_totalSupplyAt);
    }
}
