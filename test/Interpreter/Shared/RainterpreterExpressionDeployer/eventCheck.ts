import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { AllStandardOps, areEqualStateConfigs, getEventArgs, memoryOperand, MemoryType, op, StateConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

describe("Test Rainterpreter Expression Deployer event", async function () {

  it.only("DeployExpression event should emit original StateConfig", async() => {
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    )

    const config = {
      constants: [ '1', '2' ],
      sources: [
        concat([
          op(AllStandardOps.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.STATE, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.ADD, 2)
        ])
      ]
    };
    
    const expected = config;
    const tx = await expressionDeployer.deployExpression(config, [1]);
    const configFromEvent = (await getEventArgs(
      tx, 
      "DeployExpression",
      expressionDeployer
    ))[1];
    const result = {
      constants: configFromEvent.constants,
      sources: configFromEvent.sources
    } as StateConfig;

    assert(
      areEqualStateConfigs(config, result),
      `wrong solution to (7 4 2 %)
      expected  ${expected}
      got       ${result}`
    );
    
  });
});