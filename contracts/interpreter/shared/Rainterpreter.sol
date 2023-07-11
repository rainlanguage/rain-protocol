// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "rain.datacontract/lib/LibDataContract.sol";

import "../ops/AllStandardOps.sol";
import "rain.interpreter/lib/caller/LibEncodedDispatch.sol";
import "rain.lib.memkv/lib/LibMemoryKV.sol";
import "rain.interpreter/interface/IInterpreterStoreV1.sol";
import "rain.interpreter/interface/unstable/IDebugInterpreterV1.sol";
import "rain.interpreter/lib/state/LibInterpreterStateDataContract.sol";
import "rain.interpreter/lib/ns/LibNamespace.sol";
import "rain.solmem/lib/LibUint256Array.sol";
import "rain.interpreter/lib/eval/LibEval.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {IERC165Upgradeable as IERC165} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

/// @title Rainterpreter
/// @notice Minimal binding of the `IIinterpreterV1` interface to the
/// `LibInterpreterState` library, including every opcode in `AllStandardOps`.
/// This is the default implementation of "an interpreter" but is designed such
/// that other interpreters can easily be developed alongside. Alterpreters can
/// either be built by inheriting and overriding the functions on this contract,
/// or using the relevant libraries to construct an alternative binding to the
/// same interface.
contract Rainterpreter is IInterpreterV1, IDebugInterpreterV1, IERC165 {
    using LibStackPointer for Pointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256[];
    using LibEval for InterpreterState;
    using LibNamespace for StateNamespace;
    using LibInterpreterStateDataContract for bytes;
    using LibCast for function(InterpreterState memory, Operand, Pointer)
        view
        returns (Pointer)[];
    using Math for uint256;
    using LibMemoryKV for MemoryKV;

    // @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId_
    ) public view virtual override returns (bool) {
        return
            interfaceId_ == type(IInterpreterV1).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    /// @inheritdoc IDebugInterpreterV1
    function offchainDebugEval(
        IInterpreterStoreV1 store,
        FullyQualifiedNamespace namespace,
        bytes[] memory compiledSources,
        uint256[] memory constants,
        uint256[][] memory context,
        uint256[] memory stack,
        SourceIndex sourceIndex
    ) external view returns (uint256[] memory, uint256[] memory) {
        InterpreterState memory state = InterpreterState(
            stack.dataPointer(),
            constants.dataPointer(),
            MemoryKV.wrap(0),
            namespace,
            store,
            context,
            compiledSources
        );
        Pointer stackTop = state.eval(sourceIndex, state.stackBottom);
        int256 stackLengthFinal = state.stackBottom.toIndexSigned(stackTop);
        require(stackLengthFinal >= 0, "Stack underflow");
        (uint256 head, uint256[] memory tail) = stackTop.unsafeList(uint256(stackLengthFinal));
        (head);
        return (tail, state.stateKV.toUint256Array());
    }

    /// @inheritdoc IInterpreterV1
    function eval(
        IInterpreterStoreV1 store,
        StateNamespace namespace,
        EncodedDispatch dispatch,
        uint256[][] memory context
    ) external view returns (uint256[] memory, uint256[] memory) {
        // Decode the dispatch.
        (
            address expression,
            SourceIndex sourceIndex,
            uint256 maxOutputs
        ) = LibEncodedDispatch.decode(dispatch);

        // Build the interpreter state from the onchain expression.
        InterpreterState memory state = LibDataContract
            .read(expression)
            .unsafeDeserialize();
        state.stateKV = MemoryKV.wrap(0);
        state.namespace = namespace.qualifyNamespace(msg.sender);
        state.store = store;
        state.context = context;

        // Eval the expression and return up to maxOutputs from the final stack.
        Pointer stackTop = state.eval(sourceIndex, state.stackBottom);
        int256 stackLength = state.stackBottom.toIndexSigned(stackTop);
        require(stackLength >= 0, "Stack underflow");
        (uint256 head, uint256[] memory tail) = stackTop.unsafeList(maxOutputs < uint256(stackLength) ? maxOutputs : uint256(stackLength));
        (head);
        return (tail, state.stateKV.toUint256Array());
    }

    /// @inheritdoc IInterpreterV1
    function functionPointers() external view virtual returns (bytes memory) {
        return AllStandardOps.opcodeFunctionPointers();
    }
}
