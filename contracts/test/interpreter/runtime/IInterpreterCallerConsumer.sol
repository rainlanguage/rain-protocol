// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../interpreter/caller/InterpreterCallerV1.sol";  
 

contract IInterpreterCallerConsumer is InterpreterCallerV1 { 

    constructor(
        bytes memory metaHash_ , 
        InterpreterCallerV1ConstructionConfig memory interpreterCallerConfig
    ) InterpreterCallerV1(keccak256(metaHash_), interpreterCallerConfig){} 

    function deployTouchExpression(address deployer_) external {
        LibCallerMeta.touchDeployer(deployer_) ; 
    } 

    function checkCallerMeta(
        bytes memory expectedHash_,
        bytes memory callerMeta_
    ) external pure returns(bool) {
        LibCallerMeta.checkCallerMeta(keccak256(expectedHash_),callerMeta_) ; 
        return true ; 
    }

}