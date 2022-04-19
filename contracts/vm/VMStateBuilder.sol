// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;
import "../sstore2/SSTORE2.sol";

import "./RainVM.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

struct Bounds {
    uint256 stackIndex;
    uint256 stackLength;
    uint256 argumentsLength;
    uint256 storageLength;
}

uint256 constant MAX_STACK_LENGTH = type(uint8).max;

contract VMStateBuilder {
    using Math for uint256;

    mapping(address => address) private ptrCache;

    function _packedFnPtrs(address vm_) private returns (bytes memory) {
        unchecked {
            bytes memory packedPtrs_ = SSTORE2.read(ptrCache[vm_]);
            if (packedPtrs_.length == 0) {
                ptrCache[vm_] = SSTORE2.write(packFnPtrs(RainVM(vm_).fnPtrs()));
                return _packedFnPtrs(vm_);
            }
            return packedPtrs_;
        }
    }

    // /// A new shapshot has been deployed onchain.
    // /// @param sender `msg.sender` of the deployer.
    // /// @param pointer Pointer to the onchain snapshot contract.
    // /// @param state `State` of the snapshot that was deployed.
    // event Snapshot(address sender, address pointer, State state);

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function buildState(
        address vm_,
        StateConfig memory config_,
        uint256 entrypoint_
    ) external returns (bytes memory) {
        unchecked {
            Bounds memory bounds_;
            bounds_.storageLength = RainVM(vm_).storageOpcodesLength();
            ensureIntegrity(config_, bounds_, entrypoint_);

            // build a new constants array with space for the arguments.
            uint256[] memory constants_ = new uint256[](
                config_.constants.length + bounds_.argumentsLength
            );
            for (uint256 i_ = 0; i_ < config_.constants.length; i_++) {
                constants_[i_] = config_.constants[i_];
            }

            return
                LibState.toBytesPacked(
                    State(
                        0,
                        new uint256[](bounds_.stackLength),
                        config_.sources,
                        constants_,
                        config_.constants.length,
                        _packedFnPtrs(vm_)
                    )
                );
        }
    }

    function packFnPtrs(bytes memory fnPtrs_)
        internal
        pure
        returns (bytes memory)
    {
        unchecked {
            require(fnPtrs_.length % 0x20 == 0, "BAD_FN_PTRS_LENGTH");
            bytes memory fnPtrsPacked_ = new bytes(fnPtrs_.length / 0x10);
            assembly {
                for {
                    let i_ := 0
                    let o_ := 0x02
                } lt(i_, mload(fnPtrs_)) {
                    i_ := add(i_, 0x20)
                    o_ := add(o_, 0x02)
                } {
                    let location_ := add(fnPtrsPacked_, o_)
                    let old_ := mload(location_)
                    let new_ := or(old_, mload(add(fnPtrs_, add(0x20, i_))))
                    mstore(location_, new_)
                }
            }
            return fnPtrsPacked_;
        }
    }

    function _ensureIntegrityZipmap(
        StateConfig memory stateConfig_,
        Bounds memory bounds_,
        uint256 operand_
    ) private view {
        unchecked {
            uint256 valLength_ = (operand_ >> 5) + 1;
            bounds_.stackIndex -= valLength_;
            // underflow here will show up as an OOB max later.
            bounds_.stackLength = bounds_.stackLength.max(bounds_.stackIndex);
            bounds_.argumentsLength = bounds_.argumentsLength.max(valLength_);
            uint256 loopTimes_ = 1 << ((operand_ >> 3) & 0x03);
            for (uint256 n_ = 0; n_ < loopTimes_; n_++) {
                ensureIntegrity(stateConfig_, bounds_, operand_ & 0x07);
            }
        }
    }

    function ensureIntegrity(
        StateConfig memory stateConfig_,
        Bounds memory bounds_,
        uint256 entrypoint_
    ) public view {
        unchecked {
            require(stateConfig_.sources.length > entrypoint_, "MIN_SOURCES");
            bytes memory stackIndexMoveFns_ = stackIndexMoveFnPtrs();
            uint256 i_ = 0;
            uint256 sourceLen_;
            uint256 opcode_;
            uint256 operand_;
            uint256 sourceLocation_;
            uint256 firstPtrLocation_;

            assembly {
                sourceLocation_ := mload(
                    add(mload(stateConfig_), add(0x20, mul(entrypoint_, 0x20)))
                )

                sourceLen_ := mload(sourceLocation_)
                firstPtrLocation_ := add(stackIndexMoveFns_, 0x20)
            }

            while (i_ < sourceLen_) {
                assembly {
                    i_ := add(i_, 2)
                    let op_ := mload(add(sourceLocation_, i_))
                    opcode_ := byte(30, op_)
                    operand_ := byte(31, op_)
                }

                // Additional integrity checks for core opcodes.
                // Note that context length check is handled at runtime because
                // we don't know how long context should be at this point.
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
                                    stateConfig_.constants.length)
                        );
                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_STACK) {
                        // trying to read past the current stack top.
                        require(operand_ < bounds_.stackIndex);
                        bounds_.stackIndex++;
                    } else if (opcode_ == OPCODE_STORAGE) {
                        // trying to read past allowed storage slots.
                        require(operand_ < bounds_.storageLength);
                        bounds_.stackIndex++;
                    }
                    if (opcode_ == OPCODE_ZIPMAP) {
                        _ensureIntegrityZipmap(stateConfig_, bounds_, operand_);
                    }
                } else {
                    function(uint256, uint256) pure returns (uint256) fn_;
                    assembly {
                        fn_ := mload(add(firstPtrLocation_, mul(opcode_, 0x20)))
                    }
                    bounds_.stackIndex = fn_(operand_, bounds_.stackIndex);
                }

                bounds_.stackLength = bounds_.stackLength.max(
                    bounds_.stackIndex
                );
            }
            // Both an overflow or underflow in uint256 space will show up as
            // an upper bound exceeding the uint8 space.
            require(bounds_.stackLength <= MAX_STACK_LENGTH);
        }
    }

    function stackIndexMoveFnPtrs()
        public
        pure
        virtual
        returns (bytes memory)
    {}
}
