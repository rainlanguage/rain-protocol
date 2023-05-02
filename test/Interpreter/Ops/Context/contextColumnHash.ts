import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { standardEvaluableConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("ContextColumnHash Opcode test", async function () {
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

  it("should hash an entire context column", async () => {
    const { sources: sources0 } = await standardEvaluableConfig(
      rainlang`_: context-column-hash<0>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      [],
      rainInterpreter,
      1
    );

    const context0 = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context0
    );
    const result0 = await logic.stackTop();
    const expectedValue0 = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context0[0]]
    );

    assert(
      result0.eq(expectedValue0),
      `Invalid output, expected ${expectedValue0}, actual ${result0.toHexString()}`
    );

    const row: number[] = new Array<number>(16).fill(1, 0, 256);
    const context1 = [row];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context1
    );
    const result1 = await logic.stackTop();
    const expectedValue1 = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context1[0]]
    );

    assert(
      result1.eq(expectedValue1),
      `Invalid output, expected ${expectedValue1}, actual ${result1.toHexString()}`
    );

    const { sources: sources2 } = await standardEvaluableConfig(
      rainlang`_: context-column-hash<15>();`
    );

    const expression1 = await expressionConsumerDeploy(
      sources2,
      [],
      rainInterpreter,
      1
    );

    const col: number[] = [1];
    const context2 = new Array<number[]>(16).fill(col, 0, 256);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      context2
    );
    const result2 = await logic.stackTop();
    const expectedValue2 = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context2[15]]
    );

    assert(
      result2.eq(expectedValue2),
      `Invalid output, expected ${expectedValue2}, actual ${result2.toHexString()}`
    );
  });

  it("should hash a context row with single value", async () => {
    const { sources: sources0 } = await standardEvaluableConfig(
      rainlang`_: context-column-hash<1>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      [],
      rainInterpreter,
      1
    );

    const context0 = [[0, 1, 2, 3], [4], [8, 9]];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context0
    );
    const result0 = await logic.stackTop();
    const expectedValue0 = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context0[1]]
    );

    assert(
      result0.eq(expectedValue0),
      `Invalid output, expected ${expectedValue0}, actual ${result0.toHexString()}`
    );
  });

  it("should hash a empty context row", async () => {
    const { sources: sources0 } = await standardEvaluableConfig(
      rainlang`_: context-column-hash<2>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      [],
      rainInterpreter,
      1
    );

    const context0 = [[0, 1, 2, 3], [4], []];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context0
    );
    const result0 = await logic.stackTop();
    const expectedValue0 = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context0[2]]
    );
    console.log(result0.toHexString());
    assert(
      result0.eq(expectedValue0),
      `Invalid output, expected ${expectedValue0}, actual ${result0.toHexString()}`
    );
  });
});
