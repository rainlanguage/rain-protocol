import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { standardEvaluableConfig } from "../../../../utils";
import { max_uint256 } from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { assertError } from "../../../../utils/test/assertError";

// For SaturatingMath library tests, see the associated test file at test/Math/SaturatingMath.sol.ts
describe("RainInterpreter MathOps saturating math", async () => {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

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

  it("should perform saturating multiplication", async () => {
    const { sources: sourcesUnsat, constants: constantsUnsat } =
      standardEvaluableConfig(`_: mul(${max_uint256} 2);`);

    const expression0 = await expressionConsumerDeploy(
      sourcesUnsat,
      constantsUnsat,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "normal multiplication overflow did not error"
    );

    const { sources: sourcesSat, constants: constantsSat } =
      standardEvaluableConfig(`_: saturating-mul(${max_uint256} 2);`);

    const expression1 = await expressionConsumerDeploy(
      sourcesSat,
      constantsSat,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating multiplication ${expected} ${result}`
    );
  });

  it("should perform saturating subtraction", async () => {
    // test case with normal subtraction
    const { sources: sourcesUnsat, constants: constantsUnsat } =
      standardEvaluableConfig(`_: sub(10 20);`);

    const expression0 = await expressionConsumerDeploy(
      sourcesUnsat,
      constantsUnsat,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "normal subtraction overflow did not error"
    );

    const { sources: sourcesSat, constants: constantsSat } =
      standardEvaluableConfig(`_: saturating-sub(10 20);`);

    const expression1 = await expressionConsumerDeploy(
      sourcesSat,
      constantsSat,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 0;
    assert(
      result.eq(expected),
      `wrong saturating subtraction ${expected} ${result}`
    );
  });

  it("should perform saturating addition", async () => {
    // test case with normal addition
    const { sources: sourcesUnsat, constants: constantsUnsat } =
      standardEvaluableConfig(`_: add(${max_uint256} 10);`);

    const expression0 = await expressionConsumerDeploy(
      sourcesUnsat,
      constantsUnsat,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "normal addition overflow did not error"
    );

    const { sources: sourcesSat, constants: constantsSat } =
      standardEvaluableConfig(`_: saturating-add(${max_uint256} 10);`);

    const expression1 = await expressionConsumerDeploy(
      sourcesSat,
      constantsSat,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating addition ${expected} ${result}`
    );
  });
});
