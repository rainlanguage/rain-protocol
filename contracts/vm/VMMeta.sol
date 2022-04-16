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

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function newStateBytes(
        address vm_,
        StateConfig memory config_,
        uint analyzeIndex_
    ) external view returns (bytes memory) {
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, config_.sources, analyzeIndex_);
        uint256[] memory constants_ = new uint256[](
            config_.constants.length + sourceAnalysis_.argumentsUpperBound
        );
        for (uint256 i_ = 0; i_ < config_.constants.length; i_++) {
            constants_[i_] = config_.constants[i_];
        }
        bytes[] memory ptrSources_ = new bytes[](config_.sources.length);
        for (uint i_ = 0; i_ < config_.sources.length; i_++) {
            ptrSources_[i_] = ptrSource(vm_, config_.sources[i_]);
        }
        return
            LibState.toBytes(State(
                0,
                new uint256[](sourceAnalysis_.stackUpperBound),
                ptrSources_,
                constants_,
                config_.constants.length
            ));
    }

    function ptrSource(address vm_, bytes memory source_) public view returns (bytes memory) {
        unchecked {

        uint sourceLen_ = source_.length;
        require(sourceLen_ % 2 == 0, "ODD_SOURCE_LENGTH");

        DispatchTable dispatchTable_ = LibDispatchTable.fromBytes(RainVM(vm_).fnPtrs());

        bytes memory ptrSource_ = new bytes(sourceLen_ * 3 / 2);

        uint rainVMOpsLength_ = RAIN_VM_OPS_LENGTH;
        assembly {
            let start_ := 1
            let end_ := add(sourceLen_, 1)
            for { let i_ := start_ let o_ := 0 } lt(i_, end_) { i_ := add(i_, 1) } {
                let op_ := byte(31, mload(add(source_, i_)))
                // is opcode
                if mod(i_, 2) {
                    // core ops simply zero pad.
                    if lt(op_, rainVMOpsLength_) {
                        o_ := add(o_, 1)
                        mstore8(
                            add(ptrSource_, add(0x20, o_)),
                            op_
                        )
                    }
                    if iszero(lt(op_, rainVMOpsLength_)) {
                        let fn_ := mload(add(dispatchTable_, mul(op_, 0x20)))
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
                if iszero(mod(i_, 2)) {
                    mstore8(
                        add(ptrSource_, add(0x20, o_)),
                        op_
                    )
                }
                o_ := add(o_, 1)
            }
        }
        return ptrSource_;
        }
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
    ) public pure returns (SourceAnalysis memory) {
        unchecked {
            require(sources_.length > entrypoint_, "MIN_SOURCES");
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

            return sourceAnalysis_;
        }
    }

    function stackIndexDiff(uint256 opcode_, uint256)
        public
        pure
        virtual
        returns (int256)
    {}
}
