// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13; 

import "lib/forge-std/src/Test.sol"; 
import "lib/forge-std/src/console.sol";  
import "lib/rain.interface.interpreter/src/IExpressionDeployerV1.sol" ;

contract Deployer is Test{  

    event NewExpression(
        address sender,
        bytes[] sources,
        uint256[] constants,
        uint256[] minOutputs
    );  

    // the identifiers of the forks
    uint256 mumbaiFork;
    string MUMBAI_RPC_URL = "https://polygon-mumbai.g.alchemy.com/v2/jllC0ibnwVO8EiXqMikdNt07QCDTjS1h";  

    address expressionDeployerV2  ; 
    address expressionDeployerDebug  ; 


    string json ;    

    function setUp() public {  

        mumbaiFork = vm.createFork(MUMBAI_RPC_URL); 

        //Read from the config file
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/test_forge/deployer.config.json");
        json = vm.readFile(path);   

        expressionDeployerV2 = stdJson.readAddress(json,".expressionDeployerV2") ;
        expressionDeployerDebug = stdJson.readAddress(json,".expressionDeployerDebug") ;

    }  

    function testAddExpressionDeployerV2(address alice_, uint256 a_, uint256 b_) public {    

        vm.selectFork(mumbaiFork);

        // Loading Source For Add Expression 
        bytes[] memory sources = stdJson.readBytesArray(json,".sources");    

        // Operands to add
        uint256[] memory constants = new uint256[](2);  
        constants[0] = a_ ; 
        constants[1] = b_ ;
        
        //Read only one value from stack
        uint256[] memory minOutput = new uint256[](1) ; 
        minOutput[0] = 1 ;   

        vm.prank(alice_);  

        //Check Event Data
        vm.expectEmit(false, false, false, true);
        emit NewExpression(alice_,sources,constants,minOutput);   

        // Testing with Expression Deployer V2 
        // https://github.com/rainprotocol/rain-protocol/commit/5c4bb9c8cac4c45194402e7e33614ed2422c823c
        // https://github.com/rainprotocol/rain-protocol/actions/runs/4715099212/jobs/8361860546
        IExpressionDeployerV1(expressionDeployerV2).deployExpression(
            sources ,
            constants ,
            minOutput 
        );  
        vm.stopPrank() ; 

        

    } 

    function testAddExpressionDeployerDebug(address alice_, uint256 a_, uint256 b_) public {   

        vm.selectFork(mumbaiFork); 
        
        // Loading Source For Add Expression 
        bytes[] memory sources = stdJson.readBytesArray(json,".sources");    


        // Operands to add
        uint256[] memory constants = new uint256[](2);  
        constants[0] = a_ ; 
        constants[1] = b_ ;
        
        //Read only one value from stack
        uint256[] memory minOutput = new uint256[](1) ; 
        minOutput[0] = 1 ;   

        vm.prank(alice_);  

        //Check Event Data
        vm.expectEmit(false, false, false, true);
        emit NewExpression(alice_,sources,constants,minOutput);  

        // Testing with Expression Deployer Debug
        // https://github.com/rainprotocol/rain-protocol/commit/7b1e7e3389b051266a241e21efdaa17c9efaa77d
        // https://github.com/rainprotocol/rain-protocol/actions/runs/4740289766/jobs/8415947997 
        IExpressionDeployerV1(expressionDeployerDebug).deployExpression(
            sources ,
            constants ,
            minOutput 
        );  
        vm.stopPrank() ; 

        

    }

}
