import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import { StandardIntegrity } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  callOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("DO_WHILE Opcode test", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should revert when the stack size is not the same at the end of the iteration", async () => {
    const initValue = 1; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 5; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, 1), // Source is on index 1
    ]);

    // prettier-ignore
    // The loop will end with an additional element on the stack
    const sourceExtra = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
    ]);

    // prettier-ignore
    // The loop will end with a missing element in the stack.
    const sourceMissing = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
    ]);

    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN, sourceExtra],
          constants,
        }),
      "LOOP_SHIFT",
      "did not error the integrity check if there are extra values on stack at the iteration end"
    );

    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN, sourceMissing],
          constants,
        }),
      "LOOP_SHIFT",
      "did not error the integrity check if there are missing values on stack at the iteration end"
    );
  });

  it("should not loop if the conditional is zero/false value", async () => {
    const initValue = 12; // An initial value
    const loopValue = 2; // Value added on every loop
    const minimumValue = 10; // The minimum value necessary to stop the loop

    const constants = [initValue, loopValue, minimumValue];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, 1), // Source is on index 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();

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
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Since is non-zero value, the DO_WHILE op will start anyway
      op(Opcode.DO_WHILE, 1), // Source is on index 1
    ]);

    // prettier-ignore
    // Will substract on every loop until get 0 in the stack
    const sourceSUB = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.SUB, 2),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceSUB],
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();
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
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, 1), // Source is on index 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();

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

    const whileOP = op(Opcode.DO_WHILE, 1);
    const callCheckAcc = op(Opcode.CALL, callOperand(1, 2, 2));
    const callIncrease = op(Opcode.CALL, callOperand(2, 2, 3));

    // The main source where flow the script
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      callCheckAcc,
      whileOP,
    ]);

    // Source WHILE to update the values (counter and the accumalator) and check the accumalor
    const sourceWHILE = concat([callIncrease, callCheckAcc]);

    // Source to check the accumalor (should be the stack top when called)
    const sourceCHECK_ACC = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.LESS_THAN),
    ]);

    // Source to increase the counter and accumalator
    const sourceIncrease = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.ADD, 2),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.ADD, 2),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceWHILE, sourceCHECK_ACC, sourceIncrease],
      constants,
    });

    await logic.run();
    const result = await logic.stack();

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

    expectedResult.forEach((expectedStackValue, index) => {
      assert(
        expectedStackValue.eq(result[index]),
        "did not iterated correctly using call"
      );
    });
  });
});
