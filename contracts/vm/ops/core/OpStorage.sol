// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../../runtime/LibStackTop.sol";
import "../../runtime/LibVMState.sol";
import "../../integrity/LibIntegrityState.sol";

/// @title OpStorage
/// @notice Opcode for reading from storage.
library OpStorage {
    using LibStackTop for StackTop;
    using LibVMState for VMState;
    using LibIntegrityState for IntegrityState;

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            require(
                Operand.unwrap(operand_) >=
                    integrityState_.storageOpcodesRange.pointer &&
                    Operand.unwrap(operand_) <
                    integrityState_.storageOpcodesRange.pointer +
                        integrityState_.storageOpcodesRange.length,
                "OOB_STORAGE_READ"
            );
            return integrityState_.push(stackTop_);
        }
    }

    /// Stack the value in a storage slot.
    function intern(
        VMState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        assembly ("memory-safe") {
            mstore(stackTop_, sload(operand_))
        }
        return stackTop_.up();
    }

    // function extern(uint256[] memory) internal view returns (uint256[] memory) {
    //     revert IRainVMExternal.UnsupportedDispatch();
    // }
}
