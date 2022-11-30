import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { AllStandardOps, areEqualStateConfigs, getEventArgs, memoryOperand, MemoryType, op, StateConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

describe("Test Rainterpreter Expression Deployer event", async function () {

  it("DeployExpression event should emit original StateConfig", async() => { 

    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    ) 

    const config = {
      constants: [ '1', '2' ],
      sources: [
        concat([
          op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.ADD, 2)
        ])
      ]
    };
    
    const expected = config;
    const tx = await expressionDeployer.deployExpression(config, [1]); 

    const configFromEvent = (await getEventArgs(
      tx, 
      "ExpressionConfig",
      expressionDeployer
    ))[1] ;  

    
    const result = {
      constants: configFromEvent.constants,
      sources: configFromEvent.sources
    } as StateConfig;   
 

    const mathExpressionConstants = [2, 3];
    const v2 = op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v3 = op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const mathExpressionSources = [
      concat([
              v2,
              v2,
              v2,
            op(AllStandardOps.ADD, 3),
            v3,
          op(AllStandardOps.MUL, 2),
          v2,
          v3,
        op(AllStandardOps.DIV, 3),
      ]),
    ]; 

    const mathExpressionConfig  = {
      constants : mathExpressionConstants ,
      sources : mathExpressionSources
    } 

    const expectedMathResult = mathExpressionConfig;
    const mathExpressionTx = await expressionDeployer.deployExpression(mathExpressionConfig, [1]);  

    const mathConfigFromEvent = (await getEventArgs(
      mathExpressionTx, 
      "ExpressionConfig",
      expressionDeployer
    ))[1] ;  

    
    const mathResult = {
      constants: mathConfigFromEvent.constants,
      sources: mathConfigFromEvent.sources
    } as StateConfig;  



    assert(
      areEqualStateConfigs(expected, result),
      `wrong state config
      expected  ${expected}
      got       ${result}`
    );   

    assert(
      areEqualStateConfigs(expectedMathResult, mathResult),
      `wrong state config
      expected  ${expectedMathResult}
      got       ${mathResult}`
    );  






  }); 
  
  


});