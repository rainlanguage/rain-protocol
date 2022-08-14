// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../math/SaturatingMath.sol";
import "../../type/LibCast.sol";
import "./LibStackTop.sol";
import "./LibVMState.sol";
import "../../array/LibUint256Array.sol";
import "../../sstore2/SSTORE2.sol";
import "../integrity/IRainVMIntegrity.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

type SourceIndex is uint256;
type Operand is uint256;

struct StorageOpcodesRange {
    uint256 pointer;
    uint256 length;
}

/// Config required to build a new `State`.
/// @param sources Sources verbatim.
/// @param constants Constants verbatim.
struct StateConfig {
    bytes[] sources;
    uint256[] constants;
}

/// @title RainVM
/// @notice micro VM for implementing and executing custom contract DSLs.
/// Libraries and contracts map opcodes to `view` functionality then RainVM
/// runs rain scripts using these opcodes. Rain scripts dispatch as pairs of
/// bytes. The first byte is an opcode to run and the second byte is a value
/// the opcode can use contextually to inform how to run. Typically opcodes
/// will read/write to the stack to produce some meaningful final state after
/// all opcodes have been dispatched.
///
/// The only thing required to run a rain script is a `State` struct to pass
/// to `eval`, and the index of the source to run. Additional context can
/// optionally be provided to be used by opcodes. For example, an `ITierV2`
/// contract can take the input of `report`, abi encode it as context, then
/// expose a local opcode that copies this account to the stack. The state will
/// be mutated by reference rather than returned by `eval`, this is to make it
/// very clear to implementers that the inline mutation is occurring.
///
/// Rain scripts run "top to bottom", i.e. "left to right".
/// See the tests for examples on how to construct rain script in JavaScript
/// then pass to `ImmutableSource` contracts deployed by a factory that then
/// run `eval` to produce a final value.
///
/// There are only 4 "core" opcodes for `RainVM`:
/// - `0`: Copy value from either `constants` at index `operand` to the top of
///   the stack.
/// - `1`: Duplicates the value at stack index `operand_` to the top of the
///   stack.
/// - `2`: Zipmap takes N values from the stack, interprets each as an array of
///   configurable length, then zips them into `arguments` and maps a source
///   from `sources` over these. See `zipmap` for more details.
/// - `3`: Debug prints the state to the console log as per hardhat.
///
/// To do anything useful the contract that inherits `RainVM` needs to provide
/// opcodes to build up an internal DSL. This may sound complex but it only
/// requires mapping opcode integers to functions to call, and reading/writing
/// values to the stack as input/output for these functions. Further, opcode
/// packs are provided in rain that any inheriting contract can use as a normal
/// solidity library. See `MathOps.sol` opcode pack and the
/// `CalculatorTest.sol` test contract for an example of how to dispatch
/// opcodes and handle the results in a wrapping contract.
///
/// RainVM natively has no concept of branching logic such as `if` or loops.
/// An opcode pack could implement these similar to the core zipmap by lazily
/// evaluating a source from `sources` based on some condition, etc. Instead
/// some simpler, eagerly evaluated selection tools such as `min` and `max` in
/// the `MathOps` opcode pack are provided. Future versions of `RainVM` MAY
/// implement lazy `if` and other similar patterns.
///
/// The `eval` function is `view` because rain scripts are expected to compute
/// results only without modifying any state. The contract wrapping the VM is
/// free to mutate as usual. This model encourages exposing only read-only
/// functionality to end-user deployers who provide scripts to a VM factory.
/// Removing all writes removes a lot of potential foot-guns for rain script
/// authors and allows VM contract authors to reason more clearly about the
/// input/output of the wrapping solidity code.
///
/// Internally `RainVM` makes heavy use of unchecked math and assembly logic
/// as the opcode dispatch logic runs on a tight loop and so gas costs can ramp
/// up very quickly.
abstract contract RainVM {
    using Math for uint256;
    using SaturatingMath for uint256;
    using LibCast for uint256;
    using LibVMState for VMState;
    using LibStackTop for uint256[];
    using LibStackTop for bytes;
    using LibStackTop for StackTop;
    using LibCast for function(VMState memory, SourceIndex, StackTop)
        internal
        view
        returns (StackTop);

    /// Default is to disallow all storage access to opcodes.
    function storageOpcodesRange()
        public
        pure
        virtual
        returns (StorageOpcodesRange memory)
    {
        return StorageOpcodesRange(0, 0);
    }

    /// Expose all the function pointers for every opcode as 2-byte pointers in
    /// a bytes list. The implementing VM MUST ensure each pointer is to a
    /// `function(uint256,uint256) view returns (uint256)` function as this is
    /// the ONLY supported signature for opcodes. Pointers for the core opcodes
    /// must be provided in the packed pointers list but will be ignored at
    /// runtime.
    function opFunctionPointers()
        internal
        view
        virtual
        returns (
            function(VMState memory, Operand, StackTop)
                internal
                view
                returns (StackTop)[]
                memory
        );

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
    /// @param opFunctionPointers_ The function pointers packed as 2-bytes in a list
    /// in the same order/index as the relevant opcodes.
    /// @param source_ The 1-byte opcode based input source that is expected to
    /// be produced by end users.
    function ptrSource(
        function(VMState memory, Operand, StackTop)
            internal
            view
            returns (StackTop)[]
            memory opFunctionPointers_,
        bytes memory source_
    ) internal pure returns (bytes memory) {
        unchecked {
            uint256 sourceLen_ = source_.length;
            require(sourceLen_ % 2 == 0, "ODD_SOURCE_LENGTH");

            bytes memory ptrSource_ = new bytes((sourceLen_ * 3) / 2);

            assembly ("memory-safe") {
                for {
                    let opFunctionPointersBottom_ := add(
                        0x20,
                        opFunctionPointers_
                    )
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
                        mload(add(opFunctionPointersBottom_, mul(op_, 0x20))),
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

    /// Builds a new `State` bytes from `StateConfig`.
    /// Empty stack and arguments with stack index 0.
    /// @param config_ State config to build the new `State`.
    function buildStateBytes(
        IRainVMIntegrity vmIntegrity_,
        StateConfig memory config_,
        uint256[] memory finalStacks_
    ) internal view returns (bytes memory, uint256) {
        unchecked {
            (uint256 stackLength_, uint256 scratch_) = vmIntegrity_
                .ensureIntegrity(
                    storageOpcodesRange(),
                    config_.sources,
                    config_.constants.length,
                    finalStacks_
                );

            bytes[] memory ptrSources_ = new bytes[](config_.sources.length);
            function(VMState memory, Operand, StackTop)
                internal
                view
                returns (StackTop)[]
                memory opFunctionPointers_ = opFunctionPointers();
            for (uint256 i_ = 0; i_ < config_.sources.length; i_++) {
                ptrSources_[i_] = ptrSource(
                    opFunctionPointers_,
                    config_.sources[i_]
                );
            }

            return (
                LibVMState.toBytesPacked(
                    stackLength_,
                    config_.constants,
                    ptrSources_
                ),
                scratch_
            );
        }
    }
}
