// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;
import "./RainVM.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../sstore2/SSTORE2.sol";
import "./LibStackTop.sol";
import "./LibIntegrityState.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

uint256 constant MAX_STACK_LENGTH = type(uint8).max;

struct VmStructure {
    uint8 storageOpcodesPointer;
    uint8 storageOpcodesLength;
    uint16 evalPtr;
    address packedFnPtrsAddress;
}

abstract contract RainVMIntegrity {
    using SafeCast for uint256;
    using Math for uint256;
    using LibVMState for VMState;
    using LibCast for uint256;
    using LibStackTop for bytes;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];

    /// @dev total hack to differentiate between stack move functions and values
    /// we assume that no function pointers are less than this so anything we
    /// see equal to or less than is a literal stack move.
    uint256 private constant MOVE_POINTER_CUTOFF = 3;

    mapping(address => VmStructure) private structureCache;

    function _vmStructure(address vm_)
        private
        returns (VmStructure memory vmStructure_)
    {
        unchecked {
            vmStructure_ = structureCache[vm_];
            if (vmStructure_.packedFnPtrsAddress == address(0)) {
                // The VM must be a deployed contract before we attempt to
                // retrieve a structure for it.
                require(vm_.code.length > 0, "0_SIZE_VM");
                bytes memory packedFunctionPointers_ = RainVM(vm_)
                    .packedFunctionPointers();

                StorageOpcodesRange memory storageOpcodesRange_ = RainVM(vm_)
                    .storageOpcodesRange();

                uint256 evalPtr_ = RainVM(vm_).evalFunctionPointer();

                vmStructure_ = VmStructure(
                    storageOpcodesRange_.pointer.toUint8(),
                    storageOpcodesRange_.length.toUint8(),
                    uint16(evalPtr_),
                    SSTORE2.write(packedFunctionPointers_)
                );
                structureCache[vm_] = vmStructure_;
            }
        }
    }

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function buildStateBytes(
        address vm_,
        StateConfig memory config_,
        uint256[] memory finalStacks_
    ) external returns (bytes memory stateBytes_) {
        unchecked {
            VmStructure memory vmStructure_ = _vmStructure(vm_);
            bytes memory packedFnPtrs_ = SSTORE2.read(
                vmStructure_.packedFnPtrsAddress
            );

            IntegrityState memory integrityState_ = IntegrityState(
                config_.sources,
                integrityFunctionPointers(),
                StorageOpcodesRange(
                    uint256(vmStructure_.storageOpcodesPointer),
                    uint256(vmStructure_.storageOpcodesLength)
                ),
                config_.constants.length,
                0,
                StackTop.wrap(0),
                StackTop.wrap(0)
            );
            for (uint256 i_ = 0; i_ < finalStacks_.length; i_++) {
                require(
                    finalStacks_[i_] <= integrityState_.stackBottom.toIndex(
                            ensureIntegrity(
                                integrityState_,
                                SourceIndex.wrap(i_),
                                StackTop.wrap(0)
                            )
                        )
                        ,
                    "MIN_FINAL_STACK"
                );
            }

            bytes[] memory ptrSources_ = new bytes[](config_.sources.length);
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
                ptrSources_[i_] = ptrSource(packedFnPtrs_, config_.sources[i_]);
            }

            stateBytes_ = VMState(
                (
                    new uint256[](
                        integrityState_.stackBottom.toIndex(
                            integrityState_.stackMaxTop
                        )
                    )
                ).asStackTopUp(),
                config_.constants.asStackTopUp(),
                // Dummy context is never written to the packed bytes.
                new uint256[](0),
                ptrSources_,
                uint256(vmStructure_.evalPtr).asEvalFunctionPointer()
            ).toBytesPacked();
        }
    }

    /// Given a list of packed function pointers and some opcode based source,
    /// return a source with all non-core opcodes replaced with the function
    /// pointers provided. Every 1-byte opcode will be replaced with a 2-byte
    /// function pointer so the output source will be 3/2 the length of the
    /// input, after accounting for the operand which remains unchanged.
    /// Non-core opcodes remain numeric as they have special handling and are
    /// NOT compatible with the ptr/operand input system that all other ops
    /// adhere to.
    /// There is NO attempt to validate the packed fn pointers or the input
    /// source, other than to check the total length of each is even. The caller
    /// MUST ensure all integrity checks/requirements are met.
    /// @param packedFnPtrs_ The function pointers packed as 2-bytes in a list
    /// in the same order/index as the relevant opcodes.
    /// @param source_ The 1-byte opcode based input source that is expected to
    /// be produced by end users.
    function ptrSource(bytes memory packedFnPtrs_, bytes memory source_)
        internal
        pure
        returns (bytes memory)
    {
        unchecked {
            uint256 sourceLen_ = source_.length;
            require(packedFnPtrs_.length % 2 == 0, "ODD_PACKED_PTRS");
            require(sourceLen_ % 2 == 0, "ODD_SOURCE_LENGTH");

            bytes memory ptrSource_ = new bytes((sourceLen_ * 3) / 2);

            assembly ("memory-safe") {
                for {
                    let packedFnPtrsStart_ := add(2, packedFnPtrs_)
                    let inputCursor_ := add(source_, 2)
                    let end_ := add(sourceLen_, inputCursor_)
                    let outputCursor_ := add(ptrSource_, 3)
                } lt(inputCursor_, end_) {
                    inputCursor_ := add(inputCursor_, 2)
                    outputCursor_ := add(outputCursor_, 3)
                } {
                    let sourceData_ := mload(inputCursor_)
                    let op_ := byte(30, sourceData_)
                    op_ := and(
                        mload(add(packedFnPtrsStart_, mul(op_, 0x2))),
                        0xFFFF
                    )
                    mstore(
                        outputCursor_,
                        or(
                            mload(outputCursor_),
                            or(shl(8, op_), byte(31, sourceData_))
                        )
                    )
                }
            }
            return ptrSource_;
        }
    }

    function integrityFunctionPointers()
        internal
        view
        virtual
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        );

    function ensureIntegrity(
        IntegrityState memory integrityState_,
        SourceIndex sourceIndex_,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        unchecked {
            uint256 cursor_;
            uint256 end_;
            assembly ("memory-safe") {
                cursor_ := mload(
                    add(
                        mload(integrityState_),
                        add(0x20, mul(0x20, sourceIndex_))
                    )
                )
                end_ := add(cursor_, mload(cursor_))
            }

            // Loop until complete.
            while (cursor_ < end_) {
                uint256 opcode_;
                Operand operand_;
                cursor_ += 2;
                {
                    assembly ("memory-safe") {
                        let op_ := and(mload(cursor_), 0xFFFF)
                        operand_ := and(op_, 0xFF)
                        opcode_ := shr(8, op_)
                    }
                }
                // We index into the function pointers here to ensure that any
                // opcodes that we don't have a pointer for will error.
                stackTop_ = integrityState_.integrityFunctionPointers[opcode_](
                    integrityState_,
                    operand_,
                    stackTop_
                );
            }
            return stackTop_;
        }
    }
}
