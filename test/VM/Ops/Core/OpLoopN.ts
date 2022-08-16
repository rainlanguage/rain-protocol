import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  loopNOperand,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("LOOP_N Opcode test", async function () {
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

  it("should loop the source 0 times", async () => {
    const n = 0;

    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];

    // prettier-ignore
    const sourceADD = concat([
         op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.ADD, 2),
      ]);

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.LOOP_N, loopNOperand(n, 1))
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValue;
    }

    await logic.run();
    const result0 = await logic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });

  it("should loop the source N times", async () => {
    const n = 5;
    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];

    // prettier-ignore
    const sourceADD = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.ADD, 2),
      ]);

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.LOOP_N, loopNOperand(n, 1))
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValue;
    }

    await logic.run();
    const result0 = await logic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });

  it("should loop the source MAX N times", async () => {
    const n = 15;
    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];

    // prettier-ignore
    const sourceADD = concat([
         op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.ADD, 2),
      ]);

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.LOOP_N, loopNOperand(n, 1))
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValue;
    }

    await logic.run();
    const result0 = await logic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });

  it("should execute a nested loop using multiple sources", async () => {
    const n = 3;
    const initialValue = 2;
    const incrementValueOuter = 1;
    const incrementValueInner = 5;

    const constants = [initialValue, incrementValueOuter, incrementValueInner];

    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.LOOP_N, loopNOperand(n, 1))
    ]);
    // prettier-ignore
    const sourceADDOuter = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.ADD, 2),
      op(Opcode.LOOP_N, loopNOperand(n, 2))
    ]);

    // prettier-ignore
    const sourceADDInner = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.ADD, 2),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADDOuter, sourceADDInner],
      constants,
    });

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValueOuter;
      for (let j = 0; j < n; j++) {
        expectedResult += incrementValueInner;
      }
    }

    await logic.run();
    const result0 = await logic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });

  it("should explode the value calculated in the loop", async () => {
    // This test builds a (32 * 8) 256 bit value using LOOP_N and explodes it using EXPLODE32

    const n = 8;

    const initialValue = 12344;
    const incrementValue = 1;
    const finalValue = 0;
    const level = 7;
    const bits = 32;

    const constants = [
      initialValue,
      incrementValue,
      2,
      bits,
      finalValue,
      level,
      1,
    ];

    // prettier-ignore
    const sourceShiftRight = concat([
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 2
              op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)), // 32
              op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)), // LEVEL
            op(Opcode.MUL, 2), // 32 * LEVEL
          op(Opcode.EXP, 2), // 2 ** (32 * LEVEL) 
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // INITIAL_VALUE
        op(Opcode.MUL, 2),

        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)), // FINAL_VALUE        
      op(Opcode.ADD, 2),
    ]);

    // prettier-ignore
    const sourceAddAndShiftRight = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // INITIAL VALUE
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // INCREMENT
        op(Opcode.ADD, 2),

          // Right Shifting                           
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)), // INITIAL_VALUE
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)), // FINAL_VALUE
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)), // LEVEL
        op(Opcode.CALL, callOperand(3, 1, 3)),

          // Decrementing the LEVEL
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)), // LEVEL          
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6)), // LEVEL DECREMENT         
        op(Opcode.SATURATING_SUB, 2), // LEVEL - 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
      op(Opcode.CALL, callOperand(3, 3, 2)),
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // Initial Value
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4)), // FINAL VALUE
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5)), // LEVEL
      op(Opcode.LOOP_N, loopNOperand(n, 1)), 
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)), // FINAL VALUE
      op(Opcode.EXPLODE32),
    ]);

    await logic.initialize({
      sources: [
        sourceMAIN,
        sourceADD,
        sourceAddAndShiftRight,
        sourceShiftRight,
      ],
      constants,
    });

    let expectedResult = [];
    let expectedResultTemp = ethers.BigNumber.from(initialValue);
    for (let i = 0; i < n; i++) {
      expectedResultTemp = expectedResultTemp.add(incrementValue);
      expectedResult.push(expectedResultTemp);
    }

    await logic.run();
    let result0 = await logic.stack();
    result0 = result0.slice(3); // Slicing the Exploded Values

    expectedResult = expectedResult.reverse();
    expect(result0).deep.equal(
      expectedResult,
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });
});
