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

struct SourceAnalysis {
    int256 stackIndex;
    uint256 stackUpperBound;
    uint256 argumentsUpperBound;
}

contract VMMeta {
    using Math for uint256;

    /// A new shapshot has been deployed onchain.
    /// @param sender `msg.sender` of the deployer.
    /// @param pointer Pointer to the onchain snapshot contract.
    /// @param state `State` of the snapshot that was deployed.
    event Snapshot(address sender, address pointer, State state);

    function _newPointer(
        address vm_,
        StateConfig calldata stateConfig_,
        uint256 analyzeIndex_
    ) external returns (address) {
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, stateConfig_.sources, analyzeIndex_);
        return _snapshot(_newState(vm_, stateConfig_, sourceAnalysis_));
    }

    /// Builds a new `State` from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function _newState(
        address vm_,
        StateConfig calldata config_,
        SourceAnalysis memory sourceAnalysis_
    ) internal pure returns (State memory) {
        require(config_.sources.length > 0, "0_SOURCES");
        uint256[] memory constants_ = new uint256[](
            config_.constants.length + sourceAnalysis_.argumentsUpperBound
        );
        for (uint256 i_ = 0; i_ < config_.constants.length; i_++) {
            constants_[i_] = config_.constants[i_];
        }
        return
            State(
                0,
                new uint256[](sourceAnalysis_.stackUpperBound),
                config_.sources,
                constants_,
                config_.constants.length,
                RainVM(vm_).fnPtrs()
            );
    }

    /// Snapshot a RainVM state as an immutable onchain contract.
    /// Usually `State` will be new as per `newState` but can be a snapshot of
    /// an "in flight" execution state also.
    /// @param state_ The state to snapshot.
    function _snapshot(State memory state_) internal returns (address) {
        address pointer_ = SSTORE2.write(abi.encode(state_));
        emit Snapshot(msg.sender, pointer_, state_);
        return pointer_;
    }

    /// Builds a fresh state for rainVM execution from all construction data.
    /// This can be passed directly to `eval` for a `RainVM` contract.
    /// @param pointer_ The pointer (address) of the snapshot to restore.
    function _restore(address pointer_) external view returns (State memory) {
        return abi.decode(SSTORE2.read(pointer_), (State));
    }

    function _newSourceAnalysis()
        internal
        pure
        returns (SourceAnalysis memory)
    {
        return SourceAnalysis(0, 0, 0);
    }

    function analyzeZipmap(
        SourceAnalysis memory sourceAnalysis_,
        bytes[] memory sources_,
        uint256 operand_
    ) private pure {
        uint256 valLength_ = (operand_ >> 5) + 1;
        sourceAnalysis_.argumentsUpperBound = sourceAnalysis_
            .argumentsUpperBound
            .max(valLength_);
        sourceAnalysis_.stackIndex -= int256(valLength_);
        uint256 loopTimes_ = 1 << ((operand_ >> 3) & 0x03);
        for (uint256 n_ = 0; n_ < loopTimes_; n_++) {
            analyzeSources(sourceAnalysis_, sources_, operand_ & 0x07);
        }
    }

    function analyzeSources(
        SourceAnalysis memory sourceAnalysis_,
        bytes[] memory sources_,
        uint256 entrypoint_
    ) public pure {
        unchecked {
            uint256 i_ = 0;
            uint256 sourceLen_;
            uint256 opcode_;
            uint256 operand_;
            uint256 sourceLocation_;
            uint256 d_;

            assembly {
                d_ := mload(add(sources_, 0x20))
                sourceLocation_ := mload(
                    add(sources_, add(0x20, mul(entrypoint_, 0x20)))
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

                if (opcode_ < RAIN_VM_OPS_LENGTH) {
                    if (opcode_ < OPCODE_ZIPMAP) {
                        sourceAnalysis_.stackIndex++;
                    } else {
                        analyzeZipmap(sourceAnalysis_, sources_, operand_);
                    }
                } else {
                    sourceAnalysis_.stackIndex += stackIndexDiff(
                        opcode_,
                        operand_
                    );
                }
                require(sourceAnalysis_.stackIndex >= 0, "STACK_UNDERFLOW");
                sourceAnalysis_.stackUpperBound = sourceAnalysis_
                    .stackUpperBound
                    .max(uint256(sourceAnalysis_.stackIndex));
            }
        }
    }

    function stackIndexDiff(uint256 opcode_, uint256)
        public
        pure
        virtual
        returns (int256)
    {}
}
