import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { bytify, callSize, op, arg, skip } from "../Util";
import type { Contract } from "ethers";

import type { CalculatorTest } from "../../typechain/CalculatorTest";

const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  BLOCK_NUMBER,
  BLOCK_TIMESTAMP,
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  POW,
  MIN,
  MAX,
}

describe("RainVM", async function () {
  it("should support source scripts with leading zeroes", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();
    const constants = [block0];

    const vBlock = op(Opcode.VAL, 0);

    // prettier-ignore
    const source0 = concat([
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
        vBlock,
        op(Opcode.BLOCK_NUMBER),
      op(Opcode.MIN, 2),
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as CalculatorTest & Contract;

    const state = await calculator0.runState();

    console.log({ state });

    const result0 = await calculator0.run();
    assert(result0.eq(block0), `expected block ${block0} got ${result0}`);
  });

  it("should support source scripts with trailing zeroes", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();
    const constants = [block0];

    const vBlock = op(Opcode.VAL, 0);

    // prettier-ignore
    const source0 = concat([
        vBlock,
        op(Opcode.BLOCK_NUMBER),
      op(Opcode.MIN, 2),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
      op(Opcode.SKIP, 0),
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as CalculatorTest & Contract;

    const state = await calculator0.runState();

    console.log({ state });

    const result0 = await calculator0.run();
    assert(result0.eq(block0), `expected block ${block0} got ${result0}`);
  });

  it("should return block.number and block.timestamp", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    const constants = [];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.BLOCK_NUMBER)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 1,
    })) as CalculatorTest & Contract;

    const block0 = await ethers.provider.getBlockNumber();
    const result0 = await calculator0.run();
    assert(result0.eq(block0), `expected block ${block0} got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      op(Opcode.BLOCK_TIMESTAMP)
    ]);

    const calculator1 = (await calculatorFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 1,
    })) as CalculatorTest & Contract;

    const timestamp1 = Date.now();
    const result1 = await calculator1.run();

    const roughTimestamp1 = ethers.BigNumber.from(`${timestamp1}`.slice(0, 4));
    const roughResult1 = ethers.BigNumber.from(`${result1}`.slice(0, 4));

    assert(
      roughResult1.eq(roughTimestamp1),
      `expected timestamp ${roughTimestamp1} got ${roughResult1}`
    );
  });

  it("should skip (conditional skip: true)", async () => {
    this.timeout(0);

    const constants = [11, 22, 33, 44, 1];
    const v11 = op(Opcode.VAL, 0);
    const v22 = op(Opcode.VAL, 1);
    const v33 = op(Opcode.VAL, 2);
    const v44 = op(Opcode.VAL, 3);
    const v1 = op(Opcode.VAL, 4);

    const source = concat([
      // (max 33 44 1 skip 22 11)
      v44,
      v33,
      v1, // non-zero (true)
      op(Opcode.SKIP, skip(1, true)),
      v22,
      v11,
      op(Opcode.MAX, 2),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 6,
    })) as CalculatorTest & Contract;

    const state = await calculator.runState();
    console.log({ state });

    const result = await calculator.run();
    const expected = 33;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should skip (conditional skip: false)", async () => {
    this.timeout(0);

    const constants = [11, 22, 33, 44, 0];
    const v11 = op(Opcode.VAL, 0);
    const v22 = op(Opcode.VAL, 1);
    const v33 = op(Opcode.VAL, 2);
    const v44 = op(Opcode.VAL, 3);
    const v0 = op(Opcode.VAL, 4);

    const source = concat([
      // (max 44 33 0 skip 22 11)
      v44,
      v33,
      v0, // zero (false)
      op(Opcode.SKIP, skip(1, true)),
      v22,
      v11,
      op(Opcode.MAX, 4),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 6,
    })) as CalculatorTest & Contract;

    const state = await calculator.runState();
    console.log({ state });

    const result = await calculator.run();
    const expected = 44;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should skip backwards (conditional skip: true)", async () => {
    this.timeout(0);

    const constants = [1, 2];
    const v1 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);

    // Loop from 2 subtracting 1 until we hit 0 then stop looping.
    const source = concat([
      v2,
      v1,
      op(Opcode.SUB, 2),
      op(Opcode.DUP, 0),
      op(Opcode.SKIP, skip(-3, true)),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 6,
    })) as CalculatorTest & Contract;

    const state = await calculator.runState();
    console.log({ state });

    const result = await calculator.run();
    const expected = 0;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should skip (unconditional skip)", async () => {
    this.timeout(0);

    const constants = [11, 22, 33, 44];
    const v11 = op(Opcode.VAL, 0);
    const v22 = op(Opcode.VAL, 1);
    const v33 = op(Opcode.VAL, 2);
    const v44 = op(Opcode.VAL, 3);

    const source = concat([
      // (max 44 33 skip 22 11)
      v44,
      v33,
      op(Opcode.SKIP, skip(1, false)),
      v22,
      v11,
      op(Opcode.MAX, 3),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 5,
    })) as CalculatorTest & Contract;

    const state = await calculator.runState();
    console.log({ state });

    const result = await calculator.run();
    const expected = 44;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should return the maximum of a sequence of numbers", async () => {
    this.timeout(0);

    const constants = [33, 11, 22];
    const v33 = op(Opcode.VAL, 0);
    const v11 = op(Opcode.VAL, 1);
    const v22 = op(Opcode.VAL, 2);

    const source = concat([
      // (max 22 11 33)
      v22,
      v11,
      v33,
      op(Opcode.MAX, 3),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 33;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should return the minimum of a sequence of numbers", async () => {
    this.timeout(0);

    const constants = [33, 11, 22];
    const v33 = op(Opcode.VAL, 0);
    const v11 = op(Opcode.VAL, 1);
    const v22 = op(Opcode.VAL, 2);

    const source = concat([
      // (min 22 11 33)
      v22,
      v11,
      v33,
      op(Opcode.MIN, 3),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants,
      argumentsLength: 0,
      stackLength: 8,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 11;
    assert(result.eq(expected), `wrong minimum ${expected} ${result}`);
  });

  it("should run a basic program (return current block number)", async () => {
    this.timeout(0);

    const source = concat([op(Opcode.BLOCK_NUMBER)]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources: [source],
      constants: [],
      argumentsLength: 0,
      stackLength: 1,
    })) as CalculatorTest & Contract;

    await Util.createEmptyBlock(3);

    const expected = await ethers.provider.getBlockNumber();
    const result = await calculator.run();
    assert(result.eq(expected), `wrong block number ${expected} ${result}`);
  });

  it("should handle a call which loops 4 times", async () => {
    this.timeout(0);

    // zero-based counting
    const fnSize = 1;
    const loopSize = 3;
    const valSize = 1;

    const valBytes = 32 / Math.pow(2, loopSize); // 32-bit unsigned integer

    const constants = [
      concat([
        bytify(1, valBytes),
        bytify(2, valBytes),
        bytify(3, valBytes),
        bytify(4, valBytes),
        bytify(5, valBytes),
        bytify(6, valBytes),
        bytify(7, valBytes),
        bytify(8, valBytes),
      ]),
      concat([
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

    const sources = [
      concat([
        op(Opcode.VAL, 1), // val0
        op(Opcode.VAL, 0), // val1
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.MUL, 2),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.ADD, 2),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 2,
      stackLength: 32,
    })) as CalculatorTest & Contract;

    const resultState = await calculator.runState();

    const expectedStack = [
      640, 88, 490, 77, 360, 66, 250, 55, 160, 44, 90, 33, 40, 22, 10, 11, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
        stackEl.eq(expectedStack[i]),
        `wrong result of call
        index     ${i}
        expected  ${expectedStack[i]}
        got       ${stackEl}`
      );
    }
  });

  it("should handle a call which loops twice", async () => {
    this.timeout(0);

    // zero-based counting
    const fnSize = 1;
    const loopSize = 1;
    const valSize = 2;

    const valBytes = 32 / Math.pow(2, loopSize); // 128-bit unsigned

    const constants = [
      concat([bytify(3, valBytes), bytify(1, valBytes)]),
      concat([bytify(4, valBytes), bytify(2, valBytes)]),
      concat([bytify(5, valBytes), bytify(3, valBytes)]),
    ];

    const sources = [
      concat([
        op(Opcode.VAL, 2), // val0
        op(Opcode.VAL, 1), // val1
        op(Opcode.VAL, 0), // val2
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.MUL, 3),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.ADD, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 3,
      stackLength: 16,
    })) as CalculatorTest & Contract;

    const resultState = await calculator.runState();

    const expectedMul1 = 6;
    const actualMul1 = resultState.stack[0];
    assert(
      actualMul1.eq(expectedMul1),
      `wrong result of call (* 1 2 3)
      expected  ${expectedMul1}
      got       ${actualMul1}`
    );

    const expectedAdd1 = 6;
    const actualAdd1 = resultState.stack[1];
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of call (+ 1 2 3)
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedMul0 = 60;
    const actualMul0 = resultState.stack[2];
    assert(
      actualMul0.eq(expectedMul0),
      `wrong result of call (* 3 4 5)
      expected  ${expectedMul0}
      got       ${actualMul0}`
    );

    const expectedAdd0 = 12;
    const actualAdd0 = resultState.stack[3];
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of call (+ 3 4 5)
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a call op with maxed fnSize and valSize", async () => {
    this.timeout(0);

    const constants = [80, 70, 60, 50, 40, 30, 20, 10];

    // zero-based counting
    const fnSize = 1;
    const loopSize = 0;
    const valSize = 7;

    const sources = [
      concat([
        op(Opcode.VAL, 7), // val0
        op(Opcode.VAL, 6), // val1
        op(Opcode.VAL, 5), // val2
        op(Opcode.VAL, 4), // val3
        op(Opcode.VAL, 3), // val4
        op(Opcode.VAL, 2), // val5
        op(Opcode.VAL, 1), // val6
        op(Opcode.VAL, 0), // val7
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.ADD, 32), // max no. items
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.VAL, arg(6)),
        op(Opcode.VAL, arg(7)),
        op(Opcode.VAL, arg(0)),
        op(Opcode.VAL, arg(1)),
        op(Opcode.VAL, arg(2)),
        op(Opcode.VAL, arg(3)),
        op(Opcode.VAL, arg(4)),
        op(Opcode.VAL, arg(5)),
        op(Opcode.ADD, 30),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 8,
      stackLength: 32,
    })) as CalculatorTest & Contract;

    const resultState = await calculator.runState();

    const expectedIndex = 2;
    const actualIndex = resultState.stackIndex;
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedAdd1 = 1440;
    const actualAdd1 = resultState.stack[0];
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of call
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedAdd0 = 1290;
    const actualAdd0 = resultState.stack[1];
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of call
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a call op which runs multiple functions (across multiple fn vals)", async () => {
    this.timeout(0);

    const constants = [3, 2, 1];
    const v3 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v1 = op(Opcode.VAL, 2);

    const a3 = op(Opcode.VAL, arg(0));
    const a2 = op(Opcode.VAL, arg(1));
    const a1 = op(Opcode.VAL, arg(2));

    // zero-based counting
    const fnSize = 1;
    const loopSize = 0;
    const valSize = 2;

    const sources = [
      concat([
        v3,
        v2,
        v1,
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([
        // MUL
        a3,
        a2,
        a1,
        op(Opcode.MUL, 3),
        // ADD
        // 2 1, 3 2 1, 3 2 1, 3 2 1, 3 2 1 => 27
        a2,
        a1,
        a3,
        a2,
        a1,
        a3,
        a2,
        a1,
        a3,
        a2,
        a1,
        a3,
        a2,
        a1,
        op(Opcode.ADD, 14),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 8,
      stackLength: 32,
    })) as CalculatorTest & Contract;

    const resultState = await calculator.runState();

    const expectedIndex = 2;
    const actualIndex = resultState.stackIndex;
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 6;
    const actualMul = resultState.stack[0];
    assert(
      actualMul.eq(expectedMul),
      `wrong result of call
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 27;
    const actualAdd = resultState.stack[1];
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of call
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a call op which runs multiple functions (within single fn val)", async () => {
    this.timeout(0);

    const constants = [3, 4, 5];
    const v3 = op(Opcode.VAL, 0);
    const v4 = op(Opcode.VAL, 1);
    const v5 = op(Opcode.VAL, 2);

    const a3 = op(Opcode.VAL, arg(0));
    const a4 = op(Opcode.VAL, arg(1));
    const a5 = op(Opcode.VAL, arg(2));

    // zero-based counting
    const fnSize = 1;
    const loopSize = 0;
    const valSize = 2;

    const sources = [
      concat([
        v3,
        v4,
        v5,
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([a3, a4, a5, op(Opcode.MUL, 3), a3, a4, a5, op(Opcode.ADD, 3)]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 8,
      stackLength: 16,
    })) as CalculatorTest & Contract;

    const resultState = await calculator.runState();

    const expectedIndex = 2;
    const actualIndex = resultState.stackIndex;
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 60;
    const actualMul = resultState.stack[0];
    assert(
      actualMul.eq(expectedMul),
      `wrong result of call (* 3 4 5)
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 12;
    const actualAdd = resultState.stack[1];
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of call (+ 3 4 5)
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a simple call op", async () => {
    this.timeout(0);

    const constants = [1, 2, 3];
    const v1 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v3 = op(Opcode.VAL, 2);

    const a1 = op(Opcode.VAL, arg(0));
    const a2 = op(Opcode.VAL, arg(1));
    const a3 = op(Opcode.VAL, arg(2));

    const fnSize = 1; // 1
    const loopSize = 0; // 1
    const valSize = 2; // 3

    const sources = [
      concat([
        v1,
        v2,
        v3,
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
      ]),
      concat([a1, a2, a3, op(Opcode.ADD, 3)]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 8,
      stackLength: 8,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 6;
    assert(
      result.eq(expected),
      `wrong result of call
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform a calculation using the block number as a value", async () => {
    this.timeout(0);

    const constants = [1, 2, 3, 4, 6];

    const one = op(Opcode.VAL, 0);
    const two = op(Opcode.VAL, 1);
    const three = op(Opcode.VAL, 2);
    const four = op(Opcode.VAL, 3);
    const six = op(Opcode.VAL, 4);

    const sources = [
      concat([
        // (* (+ 3 4 (- 2 1)) (/ 6 3) B)
        // B 6 3 /:2 3 4 2 1 -:2 +:3 *:3
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

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 16,
    })) as CalculatorTest & Contract;

    const block0 = await ethers.provider.getBlockNumber();

    const result0 = await calculator.run();
    const expected0 = 16 * block0;
    assert(
      result0.eq(expected0),
      `wrong solution with block number of ${block0}
      expected  ${expected0}
      got       ${result0}`
    );

    await Util.createEmptyBlock();

    const result1 = await calculator.run();
    const expected1 = 16 * (block0 + 1);
    assert(
      result1.eq(expected1),
      `wrong solution with block number of ${block0 + 1}
      expected  ${expected1}
      got       ${result1}`
    );

    await Util.createEmptyBlock();

    const result2 = await calculator.run();
    const expected2 = 16 * (block0 + 2);
    assert(
      result2.eq(expected2),
      `wrong solution with block number of ${block0 + 2}
      expected  ${expected2}
      got       ${result2}`
    );
  });

  it("should calculate a mathematical expression (division, product, summation)", async () => {
    this.timeout(0);

    const constants = [2, 3];
    const v2 = op(Opcode.VAL, 0);
    const v3 = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // (/ (* (+ 2 2 2) 3) 2 3)
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

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 16,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 3;
    assert(
      result.eq(expected),
      `wrong solution to (/ (* (+ 2 2 2) 3) 2 3)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return remainder of dividing an initial number by the product of a sequence of numbers", async () => {
    this.timeout(0);

    const constants = [3, 2, 13];
    const v3 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v13 = op(Opcode.VAL, 2);

    const sources = [
      concat([
        // (% 13 2 3)
        v13,
        v2,
        v3,
        op(Opcode.MOD, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 8,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
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
    const v3 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v12 = op(Opcode.VAL, 2);

    const sources = [
      concat([
        // (/ 12 2 3)
        v12,
        v2,
        v3,
        op(Opcode.DIV, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 8,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
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
    const v5 = op(Opcode.VAL, 0);
    const v4 = op(Opcode.VAL, 1);
    const v3 = op(Opcode.VAL, 2);

    const sources = [
      concat([
        // (* 3 4 5)
        v3,
        v4,
        v5,
        op(Opcode.MUL, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 8,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
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
    const v3 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v10 = op(Opcode.VAL, 2);

    const sources = [
      concat([
        // (- 10 2 3)
        v10,
        v2,
        v3,
        op(Opcode.SUB, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 4,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
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
    const v3 = op(Opcode.VAL, 0);
    const v2 = op(Opcode.VAL, 1);
    const v1 = op(Opcode.VAL, 2);

    const sources = [
      concat([
        // (+ 1 2 3)
        v1,
        v2,
        v3,
        op(Opcode.ADD, 3),
      ]),
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      sources,
      constants,
      argumentsLength: 0,
      stackLength: 4,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 6;
    assert(result.eq(expected), `wrong summation ${expected} ${result}`);
  });
});
