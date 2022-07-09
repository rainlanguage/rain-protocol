// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;
import "./RainVM.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../sstore2/SSTORE2.sol";

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
    uint256 argumentsLength;
    uint256 storageLength;
}

uint256 constant MAX_STACK_LENGTH = type(uint8).max;

library LibFnPtrs {
    function asOpFn(uint256 i_)
        internal
        pure
        returns (function(uint256, uint256) view returns (uint256) fn_)
    {
        assembly {
            fn_ := i_
        }
    }

    function asUint(function(uint256) view returns (uint256) fn_)
        internal
        pure
        returns (uint256 i_)
    {
        assembly {
            i_ := fn_
        }
    }
}

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

    /// @dev total hack to differentiate between stack move functions and values
    /// we assume that no function pointers are less than this so anything we
    /// see equal to or less than is a literal stack move.
    uint256 private constant MOVE_POINTER_CUTOFF = 5;

    mapping(address => VmStructure) private structureCache;

    function _vmStructure(address vm_)
        private
        returns (VmStructure memory vmStructure_)
    {
        unchecked {
            vmStructure_ = structureCache[vm_];
            if (vmStructure_.packedFnPtrsAddress == address(0)) {
                bytes memory packedFnPtrs_ = packFnPtrs(RainVM(vm_).fnPtrs());
                StorageOpcodesRange memory storageOpcodesRange_ = RainVM(vm_)
                    .storageOpcodesRange();
                require(
                    storageOpcodesRange_.length <= type(uint16).max,
                    "OOB_STORAGE_OPCODES"
                );
                require(packedFnPtrs_.length % 2 == 0, "INVALID_POINTERS");

                vmStructure_ = VmStructure(
                    uint16(storageOpcodesRange_.length),
                    SSTORE2.write(packedFnPtrs_)
                );
                structureCache[vm_] = vmStructure_;
            }
        }
    }

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function buildState(
        address vm_,
        StateConfig memory config_,
        Bounds[] memory boundss_
    ) external returns (bytes memory state_) {
        unchecked {
            VmStructure memory vmStructure_ = _vmStructure(vm_);
            bytes memory packedFnPtrs_ = SSTORE2.read(
                vmStructure_.packedFnPtrsAddress
            );
            uint256 argumentsLength_ = 0;
            uint256 stackLength_ = 0;

            uint[] memory stackPops_ = stackPops();
            uint[] memory stackPushes_ = stackPushes();
            for (uint256 b_ = 0; b_ < boundss_.length; b_++) {
                boundss_[b_].storageLength = uint256(
                    vmStructure_.storageOpcodesLength
                );

                ensureIntegrity(stackPops_, stackPushes_, config_, boundss_[b_]);
                argumentsLength_ = argumentsLength_.max(
                    boundss_[b_].argumentsLength
                );
                stackLength_ = stackLength_.max(boundss_[b_].stackLength);
            }

            // build a new constants array with space for the arguments.
            uint256[] memory constants_ = new uint256[](
                config_.constants.length + argumentsLength_
            );
            for (uint256 i_ = 0; i_ < config_.constants.length; i_++) {
                constants_[i_] = config_.constants[i_];
            }

            bytes[] memory ptrSources_ = new bytes[](config_.sources.length);
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
            uint256 ag_ = gasleft();
                ptrSources_[i_] = ptrSource(packedFnPtrs_, config_.sources[i_]);
                uint256 bg_ = gasleft();
            console.log("build gas", ag_ - bg_);
            }

            state_ = LibState.toBytesPacked(
                State(
                    0,
                    new uint256[](stackLength_),
                    ptrSources_,
                    constants_,
                    config_.constants.length
                )
            );
        }
    }

    function ptrSource(bytes memory packedFnPtrs_, bytes memory source_)
        public
        pure
        returns (bytes memory)
    {
        unchecked {
            uint256 sourceLen_ = source_.length;
            require(sourceLen_ % 2 == 0, "ODD_SOURCE_LENGTH");

            bytes memory ptrSource_ = new bytes((sourceLen_ * 3) / 2);

            uint256 rainVMOpsLength_ = RAIN_VM_OPS_LENGTH;
            assembly {
                for {
                    let cursor_ := 1
                    let end_ := add(sourceLen_, cursor_)
                    let o_ := 0
                } lt(cursor_, end_) {
                    cursor_ := add(cursor_, 1)
                } {
                    let op_ := byte(31, mload(add(source_, cursor_)))
                    let isOpcode_ := mod(cursor_, 2)
                    // is opcode
                    if isOpcode_ {
                        // core ops simply zero pad.
                        if lt(op_, rainVMOpsLength_) {
                            o_ := add(o_, 1)
                            mstore8(add(ptrSource_, add(0x20, o_)), op_)
                        }
                        if iszero(lt(op_, rainVMOpsLength_)) {
                            let fn_ := mload(
                                add(packedFnPtrs_, add(0x2, mul(op_, 0x2)))
                            )
                            mstore8(
                                add(ptrSource_, add(0x20, o_)),
                                byte(30, fn_)
                            )
                            o_ := add(o_, 1)
                            mstore8(
                                add(ptrSource_, add(0x20, o_)),
                                byte(31, fn_)
                            )
                        }
                    }
                    // is operand
                    if iszero(isOpcode_) {
                        mstore8(add(ptrSource_, add(0x20, o_)), op_)
                    }
                    o_ := add(o_, 1)
                }
            }
            return ptrSource_;
        }
    }

    function packFnPtrs(uint[] memory fnPtrs_)
        internal
        pure
        returns (bytes memory)
    {
        unchecked {
            // 2 bytes per ptr.
            bytes memory fnPtrsPacked_ = new bytes(fnPtrs_.length * 2);
            assembly {
                for {
                    let cursor_ := add(fnPtrs_, 0x20)
                    let end_ := add(cursor_, mul(0x20, mload(fnPtrs_)))
                    let oCursor_ := add(fnPtrsPacked_, 0x02)
                } lt(cursor_, end_) {
                    cursor_ := add(cursor_, 0x20)
                    oCursor_ := add(oCursor_, 0x02)
                } {
                    mstore(oCursor_, or(mload(oCursor_), mload(cursor_)))
                }
            }
            return fnPtrsPacked_;
        }
    }

    function _ensureIntegrityZipmap(
        uint[] memory stackPops_,
        uint[] memory stackPushes_,
        StateConfig memory stateConfig_,
        Bounds memory bounds_,
        uint256 operand_
    ) private view {
        unchecked {
            uint256 valLength_ = (operand_ >> 5) + 1;
            // read underflow here will show up as an OOB max later.
            bounds_.stackIndex -= valLength_;
            bounds_.stackLength = bounds_.stackLength.max(bounds_.stackIndex);
            bounds_.argumentsLength = bounds_.argumentsLength.max(valLength_);
            uint256 loopTimes_ = 1 << ((operand_ >> 3) & 0x03);
            uint256 outerEntrypoint_ = bounds_.entrypoint;
            uint256 innerEntrypoint_ = operand_ & 0x07;
            bounds_.entrypoint = innerEntrypoint_;
            for (uint256 n_ = 0; n_ < loopTimes_; n_++) {
                ensureIntegrity(stackPops_, stackPushes_, stateConfig_, bounds_);
            }
            bounds_.entrypoint = outerEntrypoint_;
        }
    }

    function ensureIntegrity(
        uint[] memory stackPops_,
        uint[] memory stackPushes_,
        StateConfig memory stateConfig_,
        Bounds memory bounds_
    ) public view {
        unchecked {
            uint256 entrypoint_ = bounds_.entrypoint;
            require(stateConfig_.sources.length > entrypoint_, "MIN_SOURCES");
            uint256 i_ = 0;
            uint256 sourceLen_;
            uint256 opcode_;
            uint256 operand_;
            uint256 sourceLocation_;

            assembly {
                sourceLocation_ := mload(
                    add(mload(stateConfig_), add(0x20, mul(entrypoint_, 0x20)))
                )

                sourceLen_ := mload(sourceLocation_)
            }

            while (i_ < sourceLen_) {
                assembly {
                    i_ := add(i_, 2)
                    let op_ := mload(add(sourceLocation_, i_))
                    opcode_ := byte(30, op_)
                    operand_ := byte(31, op_)
                }

                // Additional integrity checks for core opcodes.
                if (opcode_ < RAIN_VM_OPS_LENGTH) {
                    if (opcode_ == OPCODE_CONSTANT) {
                        // trying to read past the end of the constants array.
                        // note that it is possible for a script to reach into
                        // arguments space after a zipmap has completed. While
                        // this is almost certainly a critical bug for the
                        // script it doesn't expose the ability to read past
                        // the constants array in memory so we allow it here.
                        require(
                            operand_ <
                                (bounds_.argumentsLength +
                                    stateConfig_.constants.length),
                            "OOB_CONSTANT"
                        );
                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_STACK) {
                        // trying to read past the current stack top.
                        require(operand_ < bounds_.stackIndex, "OOB_STACK");
                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_CONTEXT) {
                        // Note that context length check is handled at runtime
                        // because we don't know how long context should be at
                        // this point.
                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_STORAGE) {
                        // trying to read past allowed storage slots.
                        require(
                            operand_ < bounds_.storageLength,
                            "OOB_STORAGE"
                        );
                        bounds_.stackIndex++;
                    }
                    else if (opcode_ == OPCODE_ZIPMAP) {
                        _ensureIntegrityZipmap(stackPops_, stackPushes_, stateConfig_, bounds_, operand_);
                    }
                } else {
                    // OOB opcodes will be picked up here and error due to the
                    // index being invalid.
                    uint256 pop_ = stackPops_[opcode_];

                    // If the pop is higher than the cutoff for static pop
                    // values run it and use the return instead.
                    if (pop_ > MOVE_POINTER_CUTOFF) {
                        function(uint256) pure returns (uint256) popsFn_;
                        assembly {
                            popsFn_ := pop_
                        }
                        pop_ = popsFn_(operand_);
                    }
                    // This will catch popping/reading from underflowing the
                    // stack as it will show up as an overflow on the stack
                    // length later (but not in this unchecked block).
                    bounds_.stackIndex -= pop_;
                    bounds_.stackLength = bounds_.stackLength.max(
                        bounds_.stackIndex
                    );

                    uint256 push_ = stackPushes_[opcode_];
                    // If the push is higher than the cutoff for static push
                    // values run it and use the return instead.
                    if (push_ > MOVE_POINTER_CUTOFF) {
                        function(uint256) pure returns (uint256) pushesFn_;
                        assembly {
                            pushesFn_ := push_
                        }
                        push_ = pushesFn_(operand_);
                    }
                    bounds_.stackIndex += push_;
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

    function stackPops() public pure virtual returns (uint256[] memory) {}

    function stackPushes() public view virtual returns (uint256[] memory) {}
}
