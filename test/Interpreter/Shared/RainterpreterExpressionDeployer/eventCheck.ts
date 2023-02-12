import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  AllStandardOps,
  areEqualExpressionConfigs,
  getEventArgs,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";

import { NewExpressionEvent } from "../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";

describe("Test Rainterpreter Expression Deployer event", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });
  it("DeployExpression event should emit original NewExpressionConfig", async () => {
    const signers = await ethers.getSigners();

    const interpreter = await rainterpreterDeploy();
    const store = await rainterpreterStoreDeploy();

    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter,
      store
    );

    const config = {
      constants: ["1", "2"],
      sources: [
        concat([
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.add, 2),
        ]),
      ],
    };

    const expected = config;
    const tx = await expressionDeployer.deployExpression(
      config.sources,
      config.constants,
      [1]
    );
    const configFromEvent = (await getEventArgs(
      tx,
      "NewExpression",
      expressionDeployer
    )) as NewExpressionEvent["args"];
    console.log("configFromEvent : ", configFromEvent);

    const result = {
      sender: signers[0].address,
      constants: configFromEvent.constants,
      sources: configFromEvent.sources,
      minOutputs: [1],
    };

    const mathExpressionConstants = [2, 3];
    const v2 = op(
      AllStandardOps.readMemory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const v3 = op(
      AllStandardOps.readMemory,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const mathExpressionSources = [
      concat([
              v2,
              v2,
              v2,
            op(AllStandardOps.add, 3),
            v3,
          op(AllStandardOps.mul, 2),
          v2,
          v3,
        op(AllStandardOps.div, 3),
      ]),
    ];

    const mathExpressionConfig = {
      constants: mathExpressionConstants,
      sources: mathExpressionSources,
    };

    const expectedMathResult = mathExpressionConfig;
    const mathExpressionTx = await expressionDeployer.deployExpression(
      mathExpressionConfig.sources,
      mathExpressionConfig.constants,
      [1]
    );

    const mathConfigFromEvent = (await getEventArgs(
      mathExpressionTx,
      "NewExpression",
      expressionDeployer
    )) as NewExpressionEvent["args"];

    const mathResult = {
      sender: signers[0].address,
      constants: mathConfigFromEvent.constants,
      sources: mathConfigFromEvent.sources,
      minOutputs: [1],
    };

    assert(
      areEqualExpressionConfigs(expected, result),
      `wrong state config
      expected  ${expected}
      got       ${result}`
    );

    assert(
      areEqualExpressionConfigs(expectedMathResult, mathResult),
      `wrong state config
      expected  ${expectedMathResult}
      got       ${mathResult}`
    );
  });
});
