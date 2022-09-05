// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./StandardInterpreter.sol";

contract Rainterpreter is StandardInterpreter {
    constructor (address interpreterIntegrity_) StandardInterpreter(interpreterIntegrity_) {

    }

    function eval(address statePointer_, uint[][] memory context_) external view returns (uint[] memory) {
        return _loadInterpreterState(statePointer_, context_).eval();
    }
}