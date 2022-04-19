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

struct StackBounds {
    uint256 stackIndex;
    uint256 stackUpperBound;
    uint256 argumentsUpperBound;
}

uint256 constant MAX_STACK_LENGTH = type(uint8).max;

contract VMMeta {
    using Math for uint256;

    mapping(address => address) private ptrCache;

    function _packedFnPtrs(address vm_) private returns (bytes memory) {
        bytes memory packedPtrs_ = SSTORE2.read(ptrCache[vm_]);
        if (packedPtrs_.length == 0) {
            ptrCache[vm_] = SSTORE2.write(packFnPtrs(RainVM(vm_).fnPtrs()));
            return _packedFnPtrs(vm_);
        }
        return packedPtrs_;
    }

    // /// A new shapshot has been deployed onchain.
    // /// @param sender `msg.sender` of the deployer.
    // /// @param pointer Pointer to the onchain snapshot contract.
    // /// @param state `State` of the snapshot that was deployed.
    // event Snapshot(address sender, address pointer, State state);

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function newStateBytes(
        address vm_,
        StateConfig memory config_,
        uint256 analyzeIndex_
    ) external returns (bytes memory) {
        StackBounds memory stackBounds_ = StackBounds(0, 0, 0);
        ensureIntegrity(stackBounds_, config_.sources, analyzeIndex_);
        uint256[] memory constants_ = new uint256[](
            config_.constants.length + stackBounds_.argumentsUpperBound
        );
        for (uint256 i_ = 0; i_ < config_.constants.length; i_++) {
            constants_[i_] = config_.constants[i_];
        }

        return
            LibState.toBytesPacked(
                State(
                    0,
                    new uint256[](stackBounds_.stackUpperBound),
                    config_.sources,
                    constants_,
                    config_.constants.length,
                    _packedFnPtrs(vm_)
                )
            );
    }

    function packFnPtrs(bytes memory fnPtrs_)
        public
        pure
        returns (bytes memory)
    {
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

    function _ensureIntegrityZipmap(
        StackBounds memory stackBounds_,
        bytes[] memory sources_,
        uint256 operand_
    ) private view {
        unchecked {
            uint256 valLength_ = (operand_ >> 5) + 1;
            stackBounds_.stackIndex -= valLength_;
            // catch underflow here as a huge max.
            stackBounds_.stackUpperBound = stackBounds_.stackUpperBound.max(
                stackBounds_.stackIndex
            );
            stackBounds_.argumentsUpperBound = stackBounds_
                .argumentsUpperBound
                .max(valLength_);
            uint256 loopTimes_ = 1 << ((operand_ >> 3) & 0x03);
            for (uint256 n_ = 0; n_ < loopTimes_; n_++) {
                ensureIntegrity(stackBounds_, sources_, operand_ & 0x07);
            }
        }
    }

    function ensureIntegrity(
        StackBounds memory stackBounds_,
        bytes[] memory sources_,
        uint256 entrypoint_
    ) public view {
        unchecked {
            require(sources_.length > entrypoint_, "MIN_SOURCES");
            bytes memory stackIndexMoveFns_ = stackIndexMoveFnPtrs();
            uint256 i_ = 0;
            uint256 sourceLen_;
            uint256 opcode_;
            uint256 operand_;
            uint256 sourceLocation_;
            uint256 firstPtrLocation_;

            assembly {
                sourceLocation_ := mload(
                    add(sources_, add(0x20, mul(entrypoint_, 0x20)))
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

                if (opcode_ == OPCODE_ZIPMAP) {
                    _ensureIntegrityZipmap(
                        stackBounds_,
                        sources_,
                        operand_
                    );
                } else {
                    function(uint256, uint256) pure returns (uint256) fn_;
                    assembly {
                        fn_ := mload(add(firstPtrLocation_, mul(opcode_, 0x20)))
                    }
                    stackBounds_.stackIndex = fn_(
                        operand_,
                        stackBounds_.stackIndex
                    );
                }
                stackBounds_.stackUpperBound = stackBounds_.stackUpperBound.max(
                    stackBounds_.stackIndex
                );
            }
            // Both an overflow or underflow in uint256 space will show up as
            // an upper bound exceeding the uint8 space.
            require(stackBounds_.stackUpperBound < MAX_STACK_LENGTH);
        }
    }

    function stackIndexMoveFnPtrs()
        public
        pure
        virtual
        returns (bytes memory)
    {}
}
