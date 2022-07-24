// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;
import "./RainVM.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../sstore2/SSTORE2.sol";
import "./LibStackTop.sol";

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

/// @param stackIndex The current stack index as the state builder moves
/// through each opcode and applies the appropriate pops and pushes.
/// @param stackLength The maximum length of the stack seen so far due to stack
/// index movements. If the stack index underflows this will be close to
/// uint256 max and will ultimately error. It will also error if it overflows
/// MAX_STACK_LENGTH.
/// @param argumentsLength The maximum length of arguments seen so far due to
/// zipmap calls. Will be 0 if there are no zipmap calls.
/// @param storageLength The VM contract MUST specify which range of storage
/// slots can be read by VM scripts as [0, storageLength). If the storageLength
/// is 0 then no storage slots may be read by opcodes. In practise opcodes are
/// uint8 so storage slots beyond 255 cannot be read, notably all mappings will
/// be inaccessible.
/// @param opcodesLength The VM contract MUST specify how many valid opcodes
/// there are, where a valid opcode is one with a corresponding valid function
/// pointer in the array returned by `fnPtrs`. If this is not set correctly
/// then an attacker may specify an opcode that points to data beyond the valid
/// fnPtrs, which has undefined and therefore possibly catastrophic behaviour
/// for the implementing contract, up to and including total funds loss.
struct Bounds {
    uint256 entrypoint;
    uint256 minFinalStackIndex;
    uint256 stackIndex;
    uint256 stackLength;
    uint256 storageLength;
    uint256 contextLength;
}

uint256 constant MAX_STACK_LENGTH = type(uint8).max;

struct VmStructure {
    uint16 storageOpcodesLength;
    address packedFnPtrsAddress;
}

struct FnPtrs {
    uint256[] stackPops;
    uint256[] stackPushes;
}

contract VMStateBuilder {
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
                require(
                    storageOpcodesRange_.length <= type(uint16).max,
                    "OOB_STORAGE_OPCODES"
                );
                require(
                    packedFunctionPointers_.length % 2 == 0,
                    "INVALID_POINTERS"
                );

                vmStructure_ = VmStructure(
                    uint16(storageOpcodesRange_.length),
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
        Bounds[] memory boundss_
    ) external returns (bytes memory stateBytes_) {
        unchecked {
            VmStructure memory vmStructure_ = _vmStructure(vm_);
            bytes memory packedFnPtrs_ = SSTORE2.read(
                vmStructure_.packedFnPtrsAddress
            );
            uint256 stackLength_ = 0;

            uint256[] memory stackPops_ = stackPops();
            uint256[] memory stackPushes_ = stackPushes();
            for (uint256 b_ = 0; b_ < boundss_.length; b_++) {
                boundss_[b_].storageLength = uint256(
                    vmStructure_.storageOpcodesLength
                );

                ensureIntegrity(
                    stackPops_,
                    stackPushes_,
                    config_,
                    boundss_[b_]
                );
                stackLength_ = stackLength_.max(boundss_[b_].stackLength);
            }

            bytes[] memory ptrSources_ = new bytes[](config_.sources.length);
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
                ptrSources_[i_] = ptrSource(packedFnPtrs_, config_.sources[i_]);
            }
            // Dummy context is never written to the packed bytes.
            uint256[] memory context_ = new uint256[](0);

            stateBytes_ = VMState(
                (new uint256[](stackLength_)).asStackTopUp(),
                config_.constants.asStackTopUp(),
                context_.asStackTopUp(),
                ptrSources_
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

            uint256 nonCoreOpsStart_ = RAIN_VM_OPS_LENGTH - 1;
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
                    if gt(op_, nonCoreOpsStart_) {
                        op_ := and(
                            mload(add(packedFnPtrsStart_, mul(op_, 0x2))),
                            0xFFFF
                        )
                    }
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

    function ensureIntegrity(
        uint256[] memory stackPops_,
        uint256[] memory stackPushes_,
        StateConfig memory stateConfig_,
        Bounds memory bounds_
    ) public view {
        unchecked {
            uint256 entrypoint_ = bounds_.entrypoint;
            StackTop cursor_ = stateConfig_.sources[entrypoint_].asStackTop();
            StackTop end_ = StackTop.wrap(
                StackTop.unwrap(cursor_) +
                    stateConfig_.sources[entrypoint_].length
            );
            uint256 opcode_;
            uint256 operand_;

            while (StackTop.unwrap(cursor_) < StackTop.unwrap(end_)) {
                assembly ("memory-safe") {
                    cursor_ := add(cursor_, 2)
                    let op_ := mload(cursor_)
                    opcode_ := byte(30, op_)
                    operand_ := byte(31, op_)
                }

                // Additional integrity checks for core opcodes.
                if (opcode_ < RAIN_VM_OPS_LENGTH) {
                    if (opcode_ == OPCODE_MEMORY) {
                        uint256 type_ = operand_ & 0x3;
                        uint256 offset_ = operand_ >> 2;
                        if (type_ == OPCODE_MEMORY_TYPE_STACK) {
                            // trying to read past the current stack top.
                            require(offset_ < bounds_.stackIndex, "OOB_STACK");
                        } else if (type_ == OPCODE_MEMORY_TYPE_CONSTANT) {
                            // trying to read past the end of the constants array.
                            // note that it is possible for a script to reach into
                            // arguments space after a zipmap has completed. While
                            // this is almost certainly a critical bug for the
                            // script it doesn't expose the ability to read past
                            // the constants array in memory so we allow it here.
                            require(
                                offset_ < stateConfig_.constants.length,
                                "OOB_CONSTANT"
                            );
                        } else if (type_ == OPCODE_MEMORY_TYPE_CONTEXT) {
                            // @TODO
                            // require(
                            //     offset_ < bounds_.contextLength,
                            //     "OOB_CONTEXT"
                            // );
                        } else {
                            revert("OOB_TYPE");
                        }

                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_LOOP_N) {
                        // @TODO
                        uint256 n_ = operand_ & 0x0F;
                        uint256 loopSourceIndex_ = (operand_ & 0xF0) >> 4;
                        for (uint256 i_ = 0; i_ < n_; i_++) {
                            ensureIntegrity(
                                stackPops_,
                                stackPushes_,
                                stateConfig_,
                                bounds_
                            );
                        }
                    } else if (opcode_ == OPCODE_STORAGE) {
                        // trying to read past allowed storage slots.
                        require(
                            operand_ < bounds_.storageLength,
                            "OOB_STORAGE"
                        );
                        bounds_.stackIndex++;
                    }
                } else {
                    // This will catch popping/reading from underflowing the
                    // stack as it will show up as an overflow on the stack
                    // length later (but not in this unchecked block).
                    // OOB opcodes will be picked up here and error due to the
                    // index being invalid.
                    bounds_.stackIndex -= stackPops_[opcode_].asStackMoveFn()(
                        operand_
                    );
                    bounds_.stackLength = bounds_.stackLength.max(
                        bounds_.stackIndex
                    );

                    bounds_.stackIndex += stackPushes_[opcode_].asStackMoveFn()(
                        operand_
                    );
                }

                bounds_.stackLength = bounds_.stackLength.max(
                    bounds_.stackIndex
                );
            }
            // Both an overflow or underflow in uint256 space will show up as
            // an upper bound exceeding the uint8 space.
            require(bounds_.stackLength <= MAX_STACK_LENGTH, "MAX_STACK");
            // Stack needs to be high enough to read from after eval.
            require(
                bounds_.stackIndex >= bounds_.minFinalStackIndex,
                "FINAL_STACK_INDEX"
            );
        }
    }

    function stackPops() public view virtual returns (uint256[] memory) {}

    function stackPushes() public view virtual returns (uint256[] memory) {}
}
