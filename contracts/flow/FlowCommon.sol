// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

contract FlowCommon {
    using LibIdempotentFlag for IdempotentFlag;
    using LibInterpreter for InterpreterState;
    using LibStackTop for StackTop;
    using LibUint256Array for uint[];

    

    /// flow index => id => time
    mapping(SourceIndex => mapping(uint256 => uint256)) private _flows;

    constructor(address interpreterIntegrity_) {}

    /// @param config_ source and token config. Also controls delegated claims.
    function __FlowInterpreter_init(StateConfig calldata config_, address expressionDeployer_, address interpreter_)
        internal
        onlyInitializing
    {
        _saveInterpreterState(config_);
    }

    function flowStack(
        InterpreterState memory state_,
        SourceIndex canFlow_,
        SourceIndex flow_,
        uint256 id_
    ) internal view returns (StackTop) {
        require(
            SourceIndex.unwrap(flow_) > SourceIndex.unwrap(canFlow_),
            "FLOW_OOB"
        );
        state_.context = LibUint256Array.arrayFrom(
            SourceIndex.unwrap(flow_),
            id_
        ).matrixFrom();
        require(
            SourceIndex.unwrap(flow_) < state_.compiledSources.length,
            "FLOW_OOB"
        );
        require(state_.eval(canFlow_).peek() > 0, "CANT_FLOW");
        return state_.eval(flow_);
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