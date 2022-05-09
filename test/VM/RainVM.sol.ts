import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { bytify, callSize, op } from "../Util";
import type { Contract } from "ethers";

import type {
  AllStandardOpsTest,
  StateStruct,
} from "../../typechain/AllStandardOpsTest";
import { AllStandardOpsStateBuilder } from "../../typechain/AllStandardOpsStateBuilder";
import { FnPtrsTest } from "../../typechain/FnPtrsTest";

const { assert } = chai;

const Opcode = Util.AllStandardOps;

// Contains tests for RainVM, the constant RainVM ops as well as Math ops via AllStandardOpsTest contract.
// For SaturatingMath library tests, see the associated test file at test/Math/SaturatingMath.sol.ts
describe("RainVM", async function () {
  let stateBuilder: AllStandardOpsStateBuilder & Contract;
  let logic: AllStandardOpsTest & Contract;

  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder &
        Contract;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest & Contract;
  });

  it("should error when script length is odd", async () => {
    this.timeout(0);

    const constants = [];

    const sources = [concat([bytify(Opcode.BLOCK_NUMBER)])];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "ODD_SOURCE_LENGTH",
      "did not error when script length is odd"
    );
  });

  it("should error when contract implementing RainVM returns fnPtrs length not divisible by 32 bytes", async () => {
    this.timeout(0);

    const fnPtrsTestFactory = await ethers.getContractFactory("FnPtrsTest");
    const fnPtrsTest = (await fnPtrsTestFactory.deploy(
      stateBuilder.address
    )) as FnPtrsTest & Contract;

    const constants = [1];
    const sources = [op(Opcode.CONSTANT, 0)];

    await Util.assertError(
      async () => await fnPtrsTest.initialize({ sources, constants }),
      "BAD_FN_PTRS_LENGTH",
      "did not error when contract implementing RainVM returns fnPtrs length not divisible by 32 bytes"
    );
  });

  it("should error when script references out-of-bounds opcode", async () => {
    this.timeout(0);

    const constants = [];

    const sources = [concat([op(99)])];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_OPCODE",
      "did not error when script references out-of-bounds opcode"
    );
  });

  it("should error when trying to read an out-of-bounds argument", async () => {
    this.timeout(0);

    const constants = [1, 2, 3];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const aOOB = op(Opcode.CONSTANT, 6);

    // zero-based counting
    const sourceIndex = 1; // 1
    const loopSize = 0; // 1
    const valSize = 2; // 3

    const sources = [
      concat([
        v1,
        v2,
        v3,
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 add)
        a0,
        a1,
        aOOB,
        op(Opcode.ADD, 3),
      ]),
    ];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // there is at least an error
      "did not error when trying to read an out-of-bounds argument"
    );
  });

  it("should error when trying to read an out-of-bounds constant", async () => {
    this.timeout(0);

    const constants = [1];
    const vOOB = op(Opcode.CONSTANT, 1);

    const sources = [concat([vOOB])];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // there is at least an error
      "did not error when trying to read an out-of-bounds constant"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (underflow)", async () => {
    this.timeout(0);

    const constants = [0, 1];
    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          v0,
          v1,
        op(Opcode.EAGER_IF),
      ]),
    ];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_STACK",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (overflow)", async () => {
    this.timeout(0);

    const constants = [3, 2, 1];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v1 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (1 2 3 +)
        v1,
        v2,
        v3,
        op(Opcode.ADD, 4),
      ]),
    ];

    await Util.assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_STACK",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });

  it("should perform saturating multiplication", async () => {
    this.timeout(0);

    const constants = [Util.max_uint256, 2];
    const vMaxUInt256 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);

    // test case with normal multiplication
    const sourcesUnsat = [
      concat([
        // (max_uint256 2 *)
        vMaxUInt256,
        v2,
        op(Opcode.MUL, 2),
      ]),
    ];

    await logic.initialize({
      sources: sourcesUnsat,
      constants,
    });

    await Util.assertError(
      async () => await logic.run(),
      "Transaction reverted",
      "normal multiplication overflow did not error"
    );

    const sourcesSat = [
      concat([
        // (max_uint256 2 SAT_MUL)
        vMaxUInt256,
        v2,
        op(Opcode.SATURATING_MUL, 2),
      ]),
    ];

    await logic.initialize({
      sources: sourcesSat,
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();
    const expected = Util.max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating multiplication ${expected} ${result}`
    );
  });

  it("should perform saturating subtraction", async () => {
    this.timeout(0);

    const constants = [10, 20];
    const v10 = op(Opcode.CONSTANT, 0);
    const v20 = op(Opcode.CONSTANT, 1);

    // test case with normal subtraction
    const sourcesUnsat = [
      concat([
        // (10 20 -)
        v10,
        v20,
        op(Opcode.SUB, 2),
      ]),
    ];

    await logic.initialize({
      sources: sourcesUnsat,
      constants,
    });

    await Util.assertError(
      async () => await logic.run(),
      "Transaction reverted",
      "normal subtraction overflow did not error"
    );

    const sourcesSat = [
      concat([
        // (10 20 SAT_SUB)
        v10,
        v20,
        op(Opcode.SATURATING_SUB, 2),
      ]),
    ];

    await logic.initialize({
      sources: sourcesSat,
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 0;
    assert(
      result.eq(expected),
      `wrong saturating subtraction ${expected} ${result}`
    );
  });

  it("should perform saturating addition", async () => {
    this.timeout(0);

    const constants = [Util.max_uint256, 10];
    const vMaxUInt256 = op(Opcode.CONSTANT, 0);
    const v10 = op(Opcode.CONSTANT, 1);

    // test case with normal addition
    const sourcesUnsat = [
      concat([
        // (max_uint256 10 +)
        vMaxUInt256,
        v10,
        op(Opcode.ADD, 2),
      ]),
    ];

    await logic.initialize({ sources: sourcesUnsat, constants });

    await Util.assertError(
      async () => await logic.run(),
      "Transaction reverted",
      "normal addition overflow did not error"
    );

    const sourcesSat = [
      concat([
        // (max_uint256 1 SAT_ADD)
        vMaxUInt256,
        v10,
        op(Opcode.SATURATING_ADD, 2),
      ]),
    ];

    await logic.initialize({
      sources: sourcesSat,
      constants,
    });

    await logic.run();
    const result = await logic.stackTop();
    const expected = Util.max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating addition ${expected} ${result}`
    );
  });

  it("should return block.number and block.timestamp", async () => {
    this.timeout(0);

    const constants = [];

    // prettier-ignore
    const source0 = concat([
      // (BLOCK_NUMBER)
      op(Opcode.BLOCK_NUMBER)
    ]);

    await logic.initialize({ sources: [source0], constants });

    await logic.run();
    const block0 = await ethers.provider.getBlockNumber();
    const result0 = await logic.stackTop();
    assert(result0.eq(block0), `expected block ${block0} got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // (BLOCK_TIMESTAMP)
      op(Opcode.BLOCK_TIMESTAMP)
    ]);

    await logic.initialize({
      sources: [source1],
      constants,
    });

    const timestamp1 = Date.now();
    await logic.run();
    const result1 = await logic.stackTop();

    const roughTimestamp1 = ethers.BigNumber.from(`${timestamp1}`.slice(0, 4));
    const roughResult1 = ethers.BigNumber.from(`${result1}`.slice(0, 4));

    assert(
      roughResult1.eq(roughTimestamp1),
      `expected timestamp ${roughTimestamp1} got ${roughResult1}`
    );
  });

  it("should return correct remainder when using modulo op on sequence of numbers", async () => {
    this.timeout(0);

    const constants = [7, 4, 2];
    const v7 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (7 4 2 %)
        v7,
        v4, // -> r3
        v2, // -> r1
        op(Opcode.MOD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [9, 3];
    const v9 = op(Opcode.CONSTANT, 0);
    const v3 = op(Opcode.CONSTANT, 1);

    const sources = [
      concat([
        // (9 3 %)
        v9,
        v3,
        op(Opcode.MOD, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [5, 2];
    const v5 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);

    const sources = [
      concat([
        // (5 2 %)
        v5,
        v2,
        op(Opcode.MOD, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [2, 4, 3];
    const v2 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (2 4 3 ^)
        v2,
        v4,
        v3,
        op(Opcode.EXP, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [2, 4];
    const v2 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);

    const sources = [
      concat([
        // (2 4 ^)
        v2,
        v4,
        op(Opcode.EXP, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [33, 11, 22];
    const v33 = op(Opcode.CONSTANT, 0);
    const v11 = op(Opcode.CONSTANT, 1);
    const v22 = op(Opcode.CONSTANT, 2);

    const source = concat([
      // (22 11 33 max)
      v22,
      v11,
      v33,
      op(Opcode.MAX, 3),
    ]);

    await logic.initialize({ sources: [source], constants });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 33;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should return the minimum of a sequence of numbers", async () => {
    this.timeout(0);

    const constants = [33, 11, 22];
    const v33 = op(Opcode.CONSTANT, 0);
    const v11 = op(Opcode.CONSTANT, 1);
    const v22 = op(Opcode.CONSTANT, 2);

    const source = concat([
      // (22 11 33 min)
      v22,
      v11,
      v33,
      op(Opcode.MIN, 3),
    ]);

    await logic.initialize({ sources: [source], constants });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 11;
    assert(result.eq(expected), `wrong minimum ${expected} ${result}`);
  });

  it("should run a basic program (return current block number)", async () => {
    this.timeout(0);

    const source = concat([
      // (BLOCK_NUMBER)
      op(Opcode.BLOCK_NUMBER),
    ]);

    await logic.initialize({ sources: [source], constants: [] });

    await Util.createEmptyBlock(3);

    await logic.run();
    const expected = await ethers.provider.getBlockNumber();
    const result = await logic.stackTop();
    assert(result.eq(expected), `wrong block number ${expected} ${result}`);
  });

  it("should handle a zipmap which loops 4 times", async () => {
    this.timeout(0);

    // The following 3 variables use zero-based counting.

    // Which index in `sources` array to use as our inner function to ZIPMAP.
    const sourceIndex = 1;

    // Number of times to 'break up' our uint256 constants into a concatenated array of 'sub-constants'. In this case, we subdivide a constant 4 times, so we are left with 8 uint32 'sub-constants' concatenated together.
    const loopSize = 3;

    // Number of constants to zip together. Here we are zipping 2 constants together. Hence, our inner function will accept 2 arguments at a time (arg0, arg1), which will be the sub-constants of the respective constants.
    const valSize = 1;

    // Size of each 'sub-constant' in bytes, which can be determined by how many times we broke up our uint256. In this case we have 32-bit unsigned integers.
    const valBytes = 32 / Math.pow(2, loopSize);

    // prettier-ignore
    const constants = [ // a.k.a. 'vals'
      concat([ // constant0 -> an array of sub-constants
        bytify(1, valBytes),
        bytify(2, valBytes),
        bytify(3, valBytes),
        bytify(4, valBytes),
        bytify(5, valBytes),
        bytify(6, valBytes),
        bytify(7, valBytes),
        bytify(8, valBytes),
      ]),
      concat([ // constant1 -> an array of sub-constants
        bytify(10, valBytes),
        bytify(20, valBytes),
        bytify(30, valBytes),
        bytify(40, valBytes),
        bytify(50, valBytes),
        bytify(60, valBytes),
        bytify(70, valBytes),
        bytify(80, valBytes),
      ]),
    ];

    const val0 = 0;
    const val1 = 1;
    const arg0 = 2;
    const arg1 = 3;

    // prettier-ignore
    const sources = [
      concat([ // sourceIndex === 0 (main source)
        op(Opcode.CONSTANT, val0),
        op(Opcode.CONSTANT, val1),
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([ // sourceIndex === 1 (inner ZIPMAP function)
        // (arg0 arg1 mul) (arg0 arg1 add)
        op(Opcode.CONSTANT, arg0),
        op(Opcode.CONSTANT, arg1),
        op(Opcode.MUL, 2),
        op(Opcode.CONSTANT, arg0),
        op(Opcode.CONSTANT, arg1),
        op(Opcode.ADD, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as StateStruct;

    // We're not expecting a single result here.
    // The first 16 positions in the stack should match our expected output.
    const expectedStack = [
      640, 88, 490, 77, 360, 66, 250, 55, 160, 44, 90, 33, 40, 22, 10, 11,
    ];

    // + 10 1 => 11
    // * 10 1 => 10
    // + 20 2 => 22
    // * 20 2 => 40
    // + 30 3 => 33
    // * 30 3 => 90
    // + 40 4 => 44
    // * 40 4 => 160
    // + 50 5 => 55
    // * 50 5 => 250
    // + 60 6 => 66
    // * 60 6 => 360
    // + 70 7 => 77
    // * 70 7 => 490
    // + 80 8 => 88
    // * 80 8 => 640

    for (let i = 0; i < parseInt(resultState.stackIndex.toString(), 10); i++) {
      const stackEl = resultState.stack[i];

      assert(
        ethers.BigNumber.from(stackEl).eq(expectedStack[i]),
        `wrong result of zipmap
        index     ${i}
        expected  ${expectedStack[i]}
        got       ${stackEl}`
      );
    }
  });

  it("should handle a zipmap which loops twice", async () => {
    this.timeout(0);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 1;
    const valSize = 2;

    const valBytes = 32 / Math.pow(2, loopSize); // 128-bit unsigned

    const constants = [
      concat([bytify(3, valBytes), bytify(1, valBytes)]),
      concat([bytify(4, valBytes), bytify(2, valBytes)]),
      concat([bytify(5, valBytes), bytify(3, valBytes)]),
    ];

    const arg0 = 3;
    const arg1 = 4;
    const arg2 = 5;

    const sources = [
      concat([
        op(Opcode.CONSTANT, 2),
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONSTANT, 0),
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 mul) (arg0 arg1 arg2 add)
        op(Opcode.CONSTANT, arg0),
        op(Opcode.CONSTANT, arg1),
        op(Opcode.CONSTANT, arg2),
        op(Opcode.MUL, 3),
        op(Opcode.CONSTANT, arg0),
        op(Opcode.CONSTANT, arg1),
        op(Opcode.CONSTANT, arg2),
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as StateStruct;

    const expectedMul1 = 6;
    const actualMul1 = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul1.eq(expectedMul1),
      `wrong result of zipmap (1 2 3 *)
      expected  ${expectedMul1}
      got       ${actualMul1}`
    );

    const expectedAdd1 = 6;
    const actualAdd1 = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of zipmap (1 2 3 +)
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedMul0 = 60;
    const actualMul0 = ethers.BigNumber.from(resultState.stack[2]);
    assert(
      actualMul0.eq(expectedMul0),
      `wrong result of zipmap (3 4 5 *)
      expected  ${expectedMul0}
      got       ${actualMul0}`
    );

    const expectedAdd0 = 12;
    const actualAdd0 = ethers.BigNumber.from(resultState.stack[3]);
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of zipmap (3 4 5 +)
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a zipmap op with maxed sourceIndex and valSize", async () => {
    this.timeout(0);

    const constants = [10, 20, 30, 40, 50, 60, 70, 80];

    const a0 = op(Opcode.CONSTANT, 8);
    const a1 = op(Opcode.CONSTANT, 9);
    const a2 = op(Opcode.CONSTANT, 10);
    const a3 = op(Opcode.CONSTANT, 11);
    const a4 = op(Opcode.CONSTANT, 12);
    const a5 = op(Opcode.CONSTANT, 13);
    const a6 = op(Opcode.CONSTANT, 14);
    const a7 = op(Opcode.CONSTANT, 15);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0; // no subdivision of uint256, normal constants
    const valSize = 7;

    const sources = [
      concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONSTANT, 2),
        op(Opcode.CONSTANT, 3),
        op(Opcode.CONSTANT, 4),
        op(Opcode.CONSTANT, 5),
        op(Opcode.CONSTANT, 6),
        op(Opcode.CONSTANT, 7),
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 ... add) (arg0 arg1 arg2 ... add)
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        op(Opcode.ADD, 32), // max no. items
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
        a7,
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        op(Opcode.ADD, 30),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as StateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedAdd1 = 1440; // first add
    const actualAdd1 = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of zipmap
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedAdd0 = 1290; // second add
    const actualAdd0 = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of zipmap
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a zipmap op which runs multiple functions (across multiple fn vals)", async () => {
    this.timeout(0);

    const constants = [1, 2, 3];
    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0;
    const valSize = 2;

    const sources = [
      concat([
        v0,
        v1,
        v2,
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 mul) (arg1 arg2 arg0 arg1 arg2 ... add)
        a0,
        a1,
        a2,
        op(Opcode.MUL, 3),
        a1,
        a2,
        a0,
        a1,
        a2,
        a0,
        a1,
        a2,
        a0,
        a1,
        a2,
        a0,
        a1,
        a2,
        op(Opcode.ADD, 14),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as StateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 6;
    const actualMul = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul.eq(expectedMul),
      `wrong result of zipmap mul
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 29;
    const actualAdd = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of zipmap add
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a zipmap op which runs multiple functions (using single inner zipmap function source)", async () => {
    this.timeout(0);

    const constants = [3, 4, 5];
    const v3 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);
    const v5 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0;
    const valSize = 2;

    const sources = [
      concat([
        v3,
        v4,
        v5,
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // inner zipmap function source
        // (arg0 arg1 arg2 mul) (arg0 arg1 ar2 add)
        a0,
        a1,
        a2,
        op(Opcode.MUL, 3),
        a0,
        a1,
        a2,
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as StateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 60;
    const actualMul = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul.eq(expectedMul),
      `wrong result of zipmap (3 4 5 *)
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 12;
    const actualAdd = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of zipmap (3 4 5 +)
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a simple call op", async () => {
    this.timeout(0);

    const constants = [1, 2, 3];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

    // zero-based counting
    const sourceIndex = 1; // 1
    const loopSize = 0; // 1
    const valSize = 2; // 3

    const sources = [
      concat([
        v1,
        v2,
        v3,
        op(Opcode.ZIPMAP, callSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 add)
        a0,
        a1,
        a2,
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 6;
    assert(
      result.eq(expected),
      `wrong result of zipmap
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform a calculation using the block number as a value", async () => {
    this.timeout(0);

    const constants = [1, 2, 3, 4, 6];

    const one = op(Opcode.CONSTANT, 0);
    const two = op(Opcode.CONSTANT, 1);
    const three = op(Opcode.CONSTANT, 2);
    const four = op(Opcode.CONSTANT, 3);
    const six = op(Opcode.CONSTANT, 4);

    // prettier-ignore
    const sources = [
      concat([
        // (BLOCK_NUMBER (6 3 /) (3 4 (2 1 -) +) *)
          op(Opcode.BLOCK_NUMBER),
            six,
            three,
          op(Opcode.DIV, 2),
            three,
            four,
              two,
              one,
            op(Opcode.SUB, 2),
          op(Opcode.ADD, 3),
        op(Opcode.MUL, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const block0 = await ethers.provider.getBlockNumber();
    const result0 = await logic.stackTop();
    const expected0 = 16 * block0;
    assert(
      result0.eq(expected0),
      `wrong solution with block number of ${block0}
      expected  ${expected0}
      got       ${result0}`
    );

    await Util.createEmptyBlock();

    await logic.run();
    const block1 = await ethers.provider.getBlockNumber();

    const result1 = await logic.stackTop();
    const expected1 = 16 * block1;
    assert(
      result1.eq(expected1),
      `wrong solution with block number of ${block1 + 1}
      expected  ${expected1}
      got       ${result1}`
    );

    await Util.createEmptyBlock();

    await logic.run();
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

  it("should calculate a mathematical expression (division, product, summation)", async () => {
    this.timeout(0);

    const constants = [2, 3];
    const v2 = op(Opcode.CONSTANT, 0);
    const v3 = op(Opcode.CONSTANT, 1);

    const sources = [
      concat([
        // (((2 2 2 +) 3 *) 2 3 /)
        v2,
        v2,
        v2,
        op(Opcode.ADD, 3),
        v3,
        op(Opcode.MUL, 2),
        v2,
        v3,
        op(Opcode.DIV, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [3, 2, 13];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v13 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (13 2 3 %)
        v13,
        v2,
        v3,
        op(Opcode.MOD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [3, 2, 12];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v12 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (12 2 3 /)
        v12,
        v2,
        v3,
        op(Opcode.DIV, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [5, 4, 3];
    const v5 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (3 4 5 *)
        v3,
        v4,
        v5,
        op(Opcode.MUL, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [3, 2, 10];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v10 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (10 2 3 -)
        v10,
        v2,
        v3,
        op(Opcode.SUB, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
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
    this.timeout(0);

    const constants = [3, 2, 1];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v1 = op(Opcode.CONSTANT, 2);

    const sources = [
      concat([
        // (1 2 3 +)
        v1,
        v2,
        v3,
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 6;
    assert(result.eq(expected), `wrong summation ${expected} ${result}`);
  });
});
