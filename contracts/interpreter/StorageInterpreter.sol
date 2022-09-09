// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./deploy/LibIntegrity.sol";

struct StorageOpcodesRange {
    uint256 pointer;
    uint256 length;
}

abstract contract StorageInterpreter {
    using LibIntegrity for IntegrityState;
    using LibStackTop for StackTop;

    /// Default is to disallow all storage access to opcodes.
    function storageOpcodesRange()
        public
        pure
        virtual
        returns (StorageOpcodesRange memory)
    {
        return StorageOpcodesRange(0, 0);
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand operand_,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        unchecked {
            StorageOpcodesRange memory storageOpcodesRange_ = storageOpcodesRange();
            require(
                Operand.unwrap(operand_) >=
                    storageOpcodesRange_.pointer &&
                    Operand.unwrap(operand_) <
                    storageOpcodesRange_.pointer +
                        storageOpcodesRange_.length,
                "OOB_STORAGE_READ"
            );
            return integrityState_.push(stackTop_);
        }
    }

    /// Stack the value in a storage slot.
    function storageRead(
        InterpreterState memory,
        Operand operand_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        assembly ("memory-safe") {
            mstore(stackTop_, sload(operand_))
        }
        return stackTop_.up();
    }
}