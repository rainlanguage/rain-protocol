import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { ReadWriteTier } from "../../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../../typechain/TierReportTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  assertError,
  getBlockTimestamp,
  Tier,
  basicDeploy,
  timewarp,
  Debug,
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
    // [pairCounter, initValue, loopCounter, loopValue, minValue]
    const constants = [0, 0, 1, 3, 20];

    const callCheckValue = op(Opcode.CALL, callOperand(1, 1, 1));

    const checkValue = concat([
      // op(Opcode.DEBUG, Debug.Stack),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4)),
        // op(Opcode.DEBUG, Debug.Stack),
      op(Opcode.LESS_THAN),
    ]);


    const source = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.DEBUG, Debug.Stack),
      callCheckValue,
      op(Opcode.DEBUG, Debug.Stack)
    ]);

    await logic.initialize({
      sources: [source, checkValue],
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();

    console.log(result.toString());
  });
});
