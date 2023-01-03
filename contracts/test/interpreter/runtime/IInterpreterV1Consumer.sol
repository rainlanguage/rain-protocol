// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../interpreter/run/IInterpreterV1.sol";
import "../../../interpreter/shared/Rainterpreter.sol";
import "hardhat/console.sol";

contract IInterpreterV1Consumer {
    uint256[] private _stack;
    uint256[] private _stateChanges;

    function eval(
        IInterpreterV1 interpreter_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external {
        uint256 a_ = gasleft();
        (uint256[] memory stack_, uint256[] memory stateChanges_) = interpreter_
            .eval(dispatch_, context_);
        uint256 b_ = gasleft();
        console.log("eval gas", a_ - b_);
        _stack = stack_;
        _stateChanges = stateChanges_;
    }

    function stateChanges(
        IInterpreterV1 interpreter_,
        uint256[] memory stateChanges_
    ) external {
        uint256 a_ = gasleft();
        interpreter_.stateChanges(stateChanges_);
        uint256 b_ = gasleft();
        console.log("state changes gas", a_ - b_);
    }

    function evalWithNamespace(
        IInterpreterV1 interpreter_,
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external {
        uint256 a_ = gasleft();
        (uint256[] memory stack_, uint256[] memory stateChanges_) = interpreter_
            .evalWithNamespace(namespace_, dispatch_, context_);
        uint256 b_ = gasleft();
        console.log("eval with namespace gas", a_ - b_);
        _stack = stack_;
        _stateChanges = stateChanges_;
    }

    function stateChangesWithNamespace(
        IInterpreterV1 interpreter_,
        StateNamespace namespace_,
        uint256[] memory stateChanges_
    ) external {
        uint256 a_ = gasleft();
        interpreter_.stateChangesWithNamespace(namespace_, stateChanges_);
        uint256 b_ = gasleft();
        console.log("state changes with namespace gas", a_ - b_);
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    function stackTop() external view returns (uint256) {
        return _stack[_stack.length - 1];
    }

    function stateChanges() external view returns (uint256[] memory) {
        return _stateChanges;
    }
}
