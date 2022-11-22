// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../../../interpreter/ops/AllStandardOps.sol";
import "../../../../interpreter/deploy/RainInterpreterIntegrity.sol";
import "../../../../interpreter/run/LibEncodedDispatch.sol";

/// @title AllStandardOpsStandaloneTest
/// Exposes all standard ops for testing using standalone interpreter.
contract AllStandardOpsStandaloneTest {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256;

    uint256[] private _stack;

    IInterpreterV1 private interpreter;
    address private expression;

    function initialize(
        StateConfig calldata stateConfig_,
        address expressionDeployer_,
        address interpreter_,
        uint[] memory minOutputs_
    ) external {
        (address expression_, ) = IExpressionDeployerV1(expressionDeployer_)
            .deployExpression(stateConfig_, minOutputs_);
        expression = expression_;
        interpreter = IInterpreterV1(interpreter_);
    }

    function stackTop() external view returns (uint256) {
        return _stack.asStackTopAfter().peek();
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    /// Runs `eval` and stores full state.
    function run() public {
        SourceIndex sourceIndex_ = SourceIndex.wrap(0);
        uint256[][] memory interpreterContext_ = new uint256[][](0);
        (uint[] memory stack_, ) = interpreter.eval(
            LibEncodedDispatch.encode(expression, sourceIndex_, 1),
            interpreterContext_
        );
        _stack = stack_;
    }

    /// Runs `eval` and stores full state.
    /// @param sourceIndex_ Index of function source.
    function run(SourceIndex sourceIndex_) public {
        uint256[][] memory interpreterContext_ = new uint256[][](0);
        (uint[] memory stack_, ) = interpreter.eval(
            LibEncodedDispatch.encode(expression, sourceIndex_, 1),
            interpreterContext_
        );
        _stack = stack_;
    }

    /// Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    function runContext(uint256[][] memory context_) public {
        SourceIndex sourceIndex_ = SourceIndex.wrap(0);
        (uint[] memory stack_, ) = interpreter.eval(
            LibEncodedDispatch.encode(expression, sourceIndex_, 1),
            context_
        );
        _stack = stack_;
    }

    // Runs `eval` and stores full state. Stores `context_` to be accessed
    /// later via CONTEXT opcode.
    /// @param context_ Values for eval context.
    /// @param sourceIndex_ Index of function source.
    function runContext(
        uint256[][] memory context_,
        SourceIndex sourceIndex_
    ) public {
        (uint[] memory stack_, ) = interpreter.eval(
            LibEncodedDispatch.encode(expression, sourceIndex_, 1),
            context_
        );
        _stack = stack_;
    }
}
