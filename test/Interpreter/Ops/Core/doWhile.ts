import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOps,
  assertError,
  callOperand,
  doWhileOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("DO_WHILE Opcode test", async function () {
  // TODO: OP_DO_WHILE_INPUTS

  it("should not loop if the conditional is zero/false value", async () => {
    const initValue = 12; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),

        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.DO_WHILE, doWhileOperand(2, 0, 1)), // Source is on index 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [sourceMAIN, sourceADD],
          constants,
        },
        1
      );

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

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)), // Since is non-zero value, the DO_WHILE op will start anyway
      op(Opcode.DO_WHILE, doWhileOperand(1, 0, 1)), // Source is on index 1
    ]);

    // prettier-ignore
    // Will substract on every loop until get 0 in the stack
    const sourceSUB = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.SUB, 2),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [sourceMAIN, sourceSUB],
          constants,
        },
        1
      );

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

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, doWhileOperand(1, 0, 1)), // Source is on index 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [sourceMAIN, sourceADD],
          constants,
        },
        1
      );

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

    const whileOP = op(Opcode.DO_WHILE, doWhileOperand(2, 0, 1));
    const callCheckAcc = op(Opcode.CALL, callOperand(1, 2, 2));
    const callIncrease = op(Opcode.CALL, callOperand(2, 2, 3));

    // The main source where flow the script
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      callCheckAcc,
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
      whileOP,
    ]);

    // Source WHILE to update the values (counter and the accumalator) and check the accumalor
    // prettier-ignore
    // counter, acc -> counter, acc, isNotMin
    const sourceWHILE = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
      callIncrease,
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 2)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 3)),
      callCheckAcc,
    ]);

    // Source to check the accumalor (should be the stack top when called)
    // acc -> acc, isNonMin
    // prettier-ignore
    const sourceCHECK_ACC = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.LESS_THAN),
    ]);

    // Source to increase the counter and accumalator
    // prettier-ignore
    // counter, acc -> counter, acc
    const sourceIncrease = concat([
        // add counter
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.ADD, 2),
        // add acc
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.ADD, 2),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [sourceMAIN, sourceWHILE, sourceCHECK_ACC, sourceIncrease],
          constants,
        },
        2
      );

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
    const initValue = 3; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, doWhileOperand(20, 0, 1)), // encoding more inputs. i.e > 15
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    await assertError(
      async () =>
        await iinterpreterV1ConsumerDeploy(
          {
            sources: [sourceMAIN, sourceADD],
            constants,
          },
          1
        ),
      "DoWhileMaxInputs(20)",
      "Did not fail for an invalid input encoded in the operand"
    );
  });
});
