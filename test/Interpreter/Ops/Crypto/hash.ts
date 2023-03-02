import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { standardEvaluableConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

describe("HASH Opcode test", async function () {
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

  it("should hash a list of values from constant", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: hash(100 200 300);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [constants]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });

  it("should hash a list of values from context", async () => {
    const alice = (await ethers.getSigners())[0];

    const context = [[alice.address, 0x12031]];

    const { sources, constants } = await standardEvaluableConfig(
      `value0: context<0 0>(),
      value1: context<0 1>(),
      _: hash(value0 value1);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context
    );
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context[0]]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });

  it("should hash a single value", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: hash(${ethers.constants.MaxUint256})`
    );
    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [constants]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });
});
