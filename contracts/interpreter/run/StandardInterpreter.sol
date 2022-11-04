// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./LibInterpreterState.sol";
import "./RainInterpreter.sol";
import "../deploy/RainInterpreterIntegrity.sol";
import "../ops/AllStandardOps.sol";

uint256 constant DEFAULT_SOURCE_ID = 0;
uint256 constant DEFAULT_MIN_FINAL_STACK = 1;

contract StandardInterpreter is RainInterpreter {
    using LibInterpreterState for bytes;
    using LibUint256Array for uint256;

    event SaveInterpreterState(address sender, uint256 id, StateConfig config);

    address internal immutable self;
    address internal immutable interpreterIntegrity;

    /// Address of the immutable Rain expression deployed as a `InterpreterState`.
    mapping(uint256 => address) internal interpreterStatePointers;

    constructor(address interpreterIntegrity_) {
        self = address(this);
        interpreterIntegrity = interpreterIntegrity_;
    }

    function _saveInterpreterState(StateConfig memory config_) internal {
        return _saveInterpreterState(DEFAULT_SOURCE_ID, config_);
    }

    function _saveInterpreterState(
        uint256 id_,
        StateConfig memory config_
    ) internal {
        return _saveInterpreterState(id_, config_, DEFAULT_MIN_FINAL_STACK);
    }

    function _saveInterpreterState(
        StateConfig memory config_,
        uint256 finalMinStack_
    ) internal {
        return
            _saveInterpreterState(DEFAULT_SOURCE_ID, config_, finalMinStack_);
    }

    function _saveInterpreterState(
        uint256 id_,
        StateConfig memory config_,
        uint256 finalMinStack_
    ) internal {
        return _saveInterpreterState(id_, config_, finalMinStack_.arrayFrom());
    }

    function _saveInterpreterState(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal {
        return
            _saveInterpreterState(DEFAULT_SOURCE_ID, config_, finalMinStacks_);
    }

    function _saveInterpreterState(
        uint256 id_,
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal virtual {
        bytes memory stateBytes_ = buildStateBytes(
            IRainInterpreterIntegrity(interpreterIntegrity),
            config_,
            finalMinStacks_
        );
        emit SaveInterpreterState(msg.sender, id_, config_);
        interpreterStatePointers[id_] = SSTORE2.write(stateBytes_);
    }

    function _loadInterpreterState()
        internal
        view
        returns (InterpreterState memory)
    {
        return _loadInterpreterState(DEFAULT_SOURCE_ID);
    }

    function _loadInterpreterState(
        uint256 id_
    ) internal view virtual returns (InterpreterState memory) {
        address pointer_ = interpreterStatePointers[id_];
        require(pointer_ != address(0), "UNKNOWN_STATE");
        return SSTORE2.read(pointer_).deserialize();
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainInterpreter
    function opcodeFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(InterpreterState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }
}
