// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../idempotent/LibIdempotentFlag.sol";
import "../interpreter/LibInterpreter.sol";

contract FlowCommon {
    using LibIdempotentFlag for IdempotentFlag;
    using LibInterpreter for InterpreterState;
    using LibStackTop for StackTop;
    using LibUint256Array for uint[];

    address internal expressionPointer;
    address internal interpreter;

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address interpreterIntegrity_) {}

    /// Expression deployer, interpreter and expression must all be atmoically
    /// updated and used or we risk a critical mismatch.
    function _deployExpression(address expressionDeployer_, address interpreter_, StateConfig calldata config_, uint256[] memory finalMinStacks_)
        internal returns (address expressionPointer_)
    {
        expressionPointer_ = IExpressionDeployer(expressionDeployer_).deployExpression(config_, finalMinStacks_);
        expressionPointer = expressionPointer_;
    }

    function flowStack(
        SourceIndex canFlow_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (uint[] memory) {
        require(
            SourceIndex.unwrap(flow_) > SourceIndex.unwrap(canFlow_),
            "FLOW_OOB"
        );
        uint[][] memory context_ = LibUint256Array.arrayFrom(
            SourceIndex.unwrap(flow_),
            id_
        ).matrixFrom();
        IInterpreter interpreter_ = IInterpreter(interpreter);
        address expressionPointer_ = expressionPointer;
        require(interpreter_.eval(expressionPointer_, canFlow_).peek() > 0, "CANT_FLOW");
        return interpreter_.eval(expressionPointer_, flow_);
    }

    function _registerFlowTime(
        SourceIndex flow_,
        uint256 id_
    ) internal {
            _flows[flow_][id_] = block.timestamp;
    }

    function _flowTime(uint256 flow_, uint256 id_)
        internal
        view
        returns (uint256 flowTime_)
    {
        return _flows[SourceIndex.wrap(flow_)][id_];
    }
}