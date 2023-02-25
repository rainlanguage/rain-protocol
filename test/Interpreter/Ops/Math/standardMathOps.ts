import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { createEmptyBlock } from "../../../../utils/hardhat";
import { standardEvaluableConfig } from "../../../../utils";

describe("RainInterpreter MathOps standard math", async () => {
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

  it("should perform a calculation using the block number as a value", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mul(add(sub(2 1) 3 4) div(6 3) block-number());`
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
    const block0 = await ethers.provider.getBlockNumber();
    const result0 = await logic.stackTop();
    const expected0 = 16 * block0;
    assert(
      result0.eq(expected0),
      `wrong solution with block number of ${block0}
      expected  ${expected0}
      got       ${result0}`
    );

    await createEmptyBlock();

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block1 = await ethers.provider.getBlockNumber();

    const result1 = await logic.stackTop();
    const expected1 = 16 * block1;
    assert(
      result1.eq(expected1),
      `wrong solution with block number of ${block1 + 1}
      expected  ${expected1}
      got       ${result1}`
    );

    await createEmptyBlock();

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block2 = await ethers.provider.getBlockNumber();
    const result2 = await logic.stackTop();
    const expected2 = 16 * block2;
    assert(
      result2.eq(expected2),
      `wrong solution with block number of ${block2}
      expected  ${expected2}
      got       ${result2}`
    );
  });

  it("should return correct remainder when using modulo op on sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mod(7 4 2);`
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
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong solution to (7 4 2 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct remainder when using modulo op (zero rem)", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mod(9 3);`
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
    const expected = 0;
    assert(
      result.eq(expected),
      `wrong solution to (9 3 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct remainder when using modulo op (non-zero rem)", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mod(5 2);`
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
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong solution to (5 2 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform exponentiation on a sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: exp(2 4 3);`
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
    const expected = 4096;
    assert(
      result.eq(expected),
      `wrong solution to (2 4 3 ^)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform exponentiation correctly", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: exp(2 4);`
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
    const expected = 16;
    assert(
      result.eq(expected),
      `wrong solution to (2 4 ^)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return the maximum of a sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: max(22 11 33);`
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
    const expected = 33;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should return the minimum of a sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: min(22 11 33);`
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
    const expected = 11;
    assert(result.eq(expected), `wrong minimum ${expected} ${result}`);
  });

  it("should calculate a mathematical expression (division, product, summation)", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: div(mul(add(2 2 2) 3) 2 3);`
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
    const expected = 3;
    assert(
      result.eq(expected),
      `wrong solution to (((2 2 2 +) 3 *) 2 3 /)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return remainder of dividing an initial number by the product of a sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mod(13 2 3);`
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
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong remainder
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should divide an initial number by the product of a sequence of numbers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: div(12 2 3);`
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
    const expected = 2;
    assert(
      result.eq(expected),
      `wrong division
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should multiply a sequence of numbers together", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: mul(3 4 5);`
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
    const expected = 60;
    assert(
      result.eq(expected),
      `wrong multiplication
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should subtract a sequence of numbers from an initial number", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: sub(10 2 3);`
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
    const expected = 5;
    assert(
      result.eq(expected),
      `wrong subtraction
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should add a sequence of numbers together", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: add(1 2 3);`
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
    const expected = 6;
    assert(result.eq(expected), `wrong summation ${expected} ${result}`);
  });
});
