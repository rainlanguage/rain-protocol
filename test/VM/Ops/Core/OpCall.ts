import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsIntegrity } from "../../../../typechain/AllStandardOpsIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  assertError,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe.only("CALL Opcode test", async function () {
  let stateBuilder: AllStandardOpsIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsIntegrity"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsIntegrity;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should change the eval's scope using CALL opcode", async () => {
    const constants = [0, 1];

    // CALL opcode which will take 2 inputs, pass it to source at index 1, and return 1 output
    // input = 3 bits [ 1-7 ]
    // output = 2 bits [ 1-3]
    // sourceIndex = 3 bits [ 1-7 ]

    const callADD = op(Opcode.CALL, callOperand(2, 1, 1));

    // Source to add 2 numbers, input will be provided from another source
    const sourceADD = concat([op(Opcode.ADD, 2)]);

    // Source for calculating fibonacci sequence uptill 5
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
        callADD,
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)),
        callADD,
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
        callADD,
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 4)),
        callADD
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("5");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the minimum number of input", async () => {
    const constants = [10, 2, 20];
    const minInput = 0;
    // CALL opcode which will take 0 input, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(minInput, 1, 1));

    // Source to multiply 2 numbers, input will be provided from another source
    const source1 = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 20
      op(Opcode.MUL, 2), // 40
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
        call0,
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 10
        op(Opcode.ADD, 2) // 50
    ]);

    await logic.initialize({
      sources: [sourceMAIN, source1],
      constants,
    });

    // FAILING as
    // StackTopAfter 0  not less than StackTopMax 0
    // in popUnderflowCheck

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("50");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the maximum number of inputs and fail beyond that", async () => {
    const constants = [2];
    let maxInputs = 7;

    // CALL opcode which will take 7 inputs, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(maxInputs, 1, 1));
    const source1 = concat([op(Opcode.MUL, maxInputs)]);

    // prettier-ignore
    const sourceMAIN0 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0,
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("128");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    // Surpassing the maximum inputs
    maxInputs = 8;
    // CALL opcode which will take 8 inputs, pass it to source at index 1, and return 1 output
    const call1 = op(Opcode.CALL, callOperand(maxInputs, 1, 1));

    const source2 = concat([op(Opcode.MUL, maxInputs)]);

    // prettier-ignore
    const sourceMAIN1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call1,
    ]);

    // Failing at integrity check
    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN1, source2],
          constants,
        }),
      "STACK_UNDERFLOW",
      "Max Input integrity check failed"
    );
  });

  it("should process the minimum number of output", async () => {
    const constants = [2];
    let minOutput = 1;

    // CALL opcode which will take 7 inputs, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(2, minOutput, 1));
    const source1 = concat([op(Opcode.MUL, 2)]);

    // prettier-ignore
    const sourceMAIN0 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0,
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("4");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    // Surpassing the minimum outputs
    minOutput = 0;
    // CALL opcode which will take 8 inputs, pass it to source at index 1, and return 1 output
    const call1 = op(Opcode.CALL, callOperand(2, minOutput, 1));

    const source2 = concat([op(Opcode.MUL, 2)]);

    // prettier-ignore
    const sourceMAIN1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call1,
    ]);

    // Failing at integrity check
    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN1, source2],
          constants,
        }),
      "MIN_FINAL_STACK",
      "Minimum Output integrity check failed"
    );
  });

  it("should process the maximum number of output", async () => {
    const constants = [2];
    let maxOutput = 1;

    // CALL opcode which will take 7 inputs, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(2, maxOutput, 1));
    const source1 = concat([op(Opcode.MUL, 2)]);

    // prettier-ignore
    const sourceMAIN0 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0,
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("4");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    // Surpassing the minimum outputs
    maxOutput = 0;
    // CALL opcode which will take 8 inputs, pass it to source at index 1, and return 1 output
    const call1 = op(Opcode.CALL, callOperand(2, maxOutput, 1));

    const source2 = concat([op(Opcode.MUL, 2)]);

    // prettier-ignore
    const sourceMAIN1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call1,
    ]);

    // Failing at integrity check
    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN1, source2],
          constants,
        }),
      "MIN_FINAL_STACK",
      "Minimum Output integrity check failed"
    );
  });
});
