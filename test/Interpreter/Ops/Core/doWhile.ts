import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOps,
  assertError,
  doWhileOperand,
  memoryOperand,
  MemoryType,
  op,
  standardEvaluableConfig,
} from "../../../../utils";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("DO_WHILE Opcode test", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  // TODO: OP_DO_WHILE_INPUTS

  it("should not loop if the conditional is zero/false value", async () => {
    const initValue = 12; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    const { sources } = await standardEvaluableConfig(
      `
      /* 
      sourceMain
      */
     c0: read-memory<${MemoryType.Constant} 0>(),
     c2: read-memory<${MemoryType.Constant} 2>(),
     condition: less-than(c0 c2),
     _ _: do-while<1>(c0 c0 condition);
     
     
      /* do-while source */
      s0 s1: ,
      o1: add(s1 read-memory<${MemoryType.Constant} 1>()),
      o2: less-than(s0 read-memory<${MemoryType.Constant} 2>());
      `
    );
    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const result = await consumerLogic.stackTop();
    let expectedResult = initValue;
    while (expectedResult < minimumValue) {
      expectedResult += loopValue;
    }

    assert(
      result.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result}`
    );
  });

  it("should stop the loop when get a zero/false value as the conditional", async () => {
    const initValue = 5;
    const loopValue = 1;
    const conditionalValue = 0;

    const constants = [initValue, loopValue, conditionalValue];

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sourceMain
      */
      constant: read-memory<${MemoryType.Constant} 0>(),
      _: do-while<1>(constant constant);

      /* do-while source */
      s0 : ,
      _: sub(
          s0 
          read-memory<${MemoryType.Constant} 1>()
        ),
      _: read-memory<${MemoryType.Stack} 1>();
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result = await consumerLogic.stackTop();

    console.log("Result: ", result.toString());

    let expectedResult = initValue;
    while (expectedResult > 0) {
      expectedResult -= loopValue;
    }

    assert(
      result.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result}`
    );
  });

  it("should loop until it reach at least a number", async () => {
    const initValue = 3; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sourceMain
      */
      c1: read-memory<${MemoryType.Constant} 0>(),
      condition: less-than(c1 read-memory<${MemoryType.Constant} 2>()),
      _: do-while<1>(c1 condition);

      /* do-while source */
      s0: ,
      o1: add(s0 read-memory<${MemoryType.Constant} 1>()),
      _: less-than(o1 read-memory<${MemoryType.Constant} 2>());
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result = await consumerLogic.stackTop();

    let expectedResult = initValue;
    while (expectedResult < minimumValue) {
      expectedResult += loopValue;
    }

    assert(
      result.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result}`
    );
  });

  it("should be able to run correctly with new stack using CALL op", async () => {
    const loopCounter = 0; // Init value to the loop counter
    const initAcc = 0; // Init value to the accumulator
    const addCounter = 1; // Increase the counter by one in every loop
    const addAcc = 3; // Increase by three the accumulator in every loop
    const minValue = 20; // Min required to finish the script

    const constants = [loopCounter, initAcc, addCounter, addAcc, minValue];

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sourceMain
      */
      c0: read-memory<${MemoryType.Constant} 0>(),
      c1: read-memory<${MemoryType.Constant} 1>(),
      condition: call<1 2>(c1), /* callCheckAcc */
      _ _: do-while<1>(c0 c1 condition);
      
      /* sourceWHILE */
      s0 s1: ,
      o0 o1: call<2 3>(s0 s1),
      condition: call<1 2>(o1); /* callCheckAcc */

      /* sourceCheckAcc */
      s0: ,
      _: less-than(s0 read-memory<${MemoryType.Constant} 4>());

      /* sourceIncrease */
      s0 s1: ,
      _: add(s0 read-memory<${MemoryType.Constant} 2>()),
      _: add(s1 read-memory<${MemoryType.Constant} 3>());
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 2);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result = await consumerLogic.stack();

    // Calculating the expected result
    let expectedCounter = loopCounter;
    let expectedAcc = initAcc;
    while (expectedAcc < minValue) {
      expectedCounter += addCounter;
      expectedAcc += addAcc;
    }

    const expectedResult = [
      ethers.BigNumber.from(expectedCounter),
      ethers.BigNumber.from(expectedAcc),
    ];
    console.log(result);
    console.log(expectedResult);

    expectedResult.forEach((expectedStackValue, index) => {
      assert(
        expectedStackValue.eq(result[index]),
        "did not iterate correctly using call"
      );
    });
  });

  it("should fail if more inputs are encoded in the operand than can be dispatched internally by the do-while loop", async () => {
    // Cannot represent the below behavior in rainlang

    const initValue = 3; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.less_than),
      op(Opcode.do_while, doWhileOperand(20, 0, 1)), // encoding more inputs. i.e > 15
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.add, 2),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.less_than),
    ]);

    await assertError(
      async () =>
        await iinterpreterV1ConsumerDeploy(
          [sourceMAIN, sourceADD],
          constants,

          1
        ),
      "DoWhileMaxInputs(20)",
      "Did not fail for an invalid input encoded in the operand"
    );
  });
});
