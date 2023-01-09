// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../interpreter/run/IInterpreterV1.sol";
import "../../../interpreter/shared/Rainterpreter.sol";
import "../../../interpreter/store/IInterpreterStoreV1.sol";
import "hardhat/console.sol";

contract IInterpreterV1Consumer {
    uint256[] private _stack;
    IInterpreterStoreV1 _store;
    uint256[] private _kvs;

    function eval(
        IInterpreterV1 interpreter_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) external {
        evalWithNamespace(
            interpreter_,
            DEFAULT_STATE_NAMESPACE,
            dispatch_,
            context_
        );
    }

    function evalWithNamespace(
        IInterpreterV1 interpreter_,
        StateNamespace namespace_,
        EncodedDispatch dispatch_,
        uint256[][] memory context_
    ) public {
        uint256 a_ = gasleft();
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = interpreter_.eval(namespace_, dispatch_, context_);
        uint256 b_ = gasleft();
        console.log("eval gas", a_ - b_);
        _stack = stack_;
        _store = store_;
        _kvs = kvs_;
    }

    function set(
        IInterpreterStoreV1 store_,
        StateNamespace namespace_,
        uint256[] memory kvs_
    ) public {
        uint256 a_ = gasleft();
        store_.set(namespace_, kvs_);
        uint256 b_ = gasleft();
        console.log("set gas", a_ - b_);
    }

    function set(IInterpreterStoreV1 store_, uint256[] memory kvs_) external {
        set(store_, DEFAULT_STATE_NAMESPACE, kvs_);
    }

    function stack() external view returns (uint256[] memory) {
        return _stack;
    }

    function stackTop() external view returns (uint256) {
        return _stack[_stack.length - 1];
    }

    function store() external view returns (IInterpreterStoreV1) {
        return _store;
    }

    function kvs() external view returns (uint256[] memory) {
        return _kvs;
    }
}
