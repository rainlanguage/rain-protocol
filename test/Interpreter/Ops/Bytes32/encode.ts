import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { max_uint256, standardEvaluableConfig } from "../../../../utils";

import { rainterpreterDeploy, rainterpreterStoreDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

describe("Enode Op Tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("Encode Op Test", async () => {
    
    
    const source_ = 0x000000000000000000000000000000000000000000000000000000000000000a
    const target =  0x000000000000000000000000000000000000000000000000000000000000000f 
    const expected = 0x0000000000000000000000000000000000000000000000000000000000000a0f  
   
    const { sources: sources0, constants: constants0 } = standardEvaluableConfig(
      `_: encode-256<8 4>(${source_} ${target});`
    );  
 

    const expression0 = await expressionConsumerDeploy(
       sources0,
       constants0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    ); 

    const encodedResult = await logic.stackTop() 
    console.log("encodedResult : " , encodedResult ) 

    
    const { sources: sources1, constants: constants1 } = standardEvaluableConfig(
        `_: decode-256<8 255>(${expected});`
    ); 

    const expression1 = await expressionConsumerDeploy(
        sources1,
        constants1,
       rainInterpreter,
    1
    );

    await logic["eval(address,uint256,uint256[][])"](
    rainInterpreter.address,
    expression1.dispatch,
    []
    ); 

    const decodedResult = await logic.stackTop() 
    console.log("decodedResult : " , decodedResult )

    

  }); 

  
});
 
