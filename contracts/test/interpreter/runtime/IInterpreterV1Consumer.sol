// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../interpreter/run/IInterpreterV1.sol";
import "../../../interpreter/shared/Rainterpreter.sol";
import "hardhat/console.sol";

contract IInterpreterV1Consumer {
    uint[] private _stack;
    uint[] private _stateChanges;

    function eval(
        IInterpreterV1 interpreter_,
        EncodedDispatch dispatch_,
        uint[][] memory context_
    ) external {
        uint a_ = gasleft();
        (uint[] memory stack_, uint[] memory stateChanges_) = interpreter_.eval(
            dispatch_,
            context_
        );
        uint b_ = gasleft();
        console.log("eval gas", a_ - b_);
        _stack = stack_;
        _stateChanges = stateChanges_;
    }

    function stateChanges(
        IInterpreterV1 interpreter_,
        uint[] memory stateChanges_
    ) external {
        uint a_ = gasleft();
        interpreter_.stateChanges(stateChanges_);
        uint b_ = gasleft();
        console.log("state changes gas", a_ - b_);
    }

    function evalWithNamespace(
        IInterpreterV1 interpreter_,
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint[][] memory context_
    ) external {
        uint a_ = gasleft();
        (uint[] memory stack_, uint[] memory stateChanges_) = interpreter_
            .evalWithNamespace(namespace_, dispatch_, context_);
        uint b_ = gasleft();
        console.log("eval with namespace gas", a_ - b_);
        _stack = stack_;
        _stateChanges = stateChanges_;
    }

    function stateChangesWithNamespace(
        IInterpreterV1 interpreter_,
        StateNamespace namespace_,
        uint[] memory stateChanges_
    ) external {
        uint a_ = gasleft();
        interpreter_.stateChangesWithNamespace(namespace_, stateChanges_);
        uint b_ = gasleft();
        console.log("state changes with namespace gas", a_ - b_);
    }

    function stack() external view returns (uint[] memory) {
        return _stack;
    }
    
    function stackTop() external view returns (uint256) {
        return _stack[_stack.length - 1];
    }

    function stateChanges() external view returns (uint[] memory) {
        return _stateChanges;
    }
}
