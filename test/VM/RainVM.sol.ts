import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { bytify, callSize, op } from "../Util";
import type { Contract } from "ethers";

import type { CalculatorTest } from "../../typechain/CalculatorTest";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

const enum Opcode {
  END,
  VAL,
  ZIPMAP,
  BLOCK_NUMBER,
  ADD,
  SUB,
  MUL,
  POW,
  DIV,
  MOD,
}

describe("RainVM", async function () {
  it("should run a basic program (return current block number)", async () => {
    this.timeout(0);

    const vals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [concat([op(Opcode.BLOCK_NUMBER)]), 0, 0, 0];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    await Util.createEmptyBlock(3);

    const expected = await ethers.provider.getBlockNumber();
    const result = await calculator.run();
    assert(result.eq(expected), `wrong block number ${expected} ${result}`);
  });

  xit("should handle a call which loops 8 (max) times", async () => {
    this.timeout(0);

    // zero-based counting
    const fnSize = 0;
    const loopSize = 7;
    const valSize = 1;

    // 0.25 bytes = 2-bit unsigned integer
    // const valBytes = 32 / Math.pow(2, loopSize);

    const numbers = Util.array2BitUInts(128);

    // pack 32 1-byte hex values into uint256
    const val256 = concat(
      Util.pack2BitUIntsIntoByte(numbers) // pack 2-bit uints into single byte, 4 at a time
        .map((byte) => hexlify(byte)) // convert each 1-byte number to 1-byte hex
    );

    console.log(ethers.BigNumber.from(val256));
    // assert(ethers.BigNumber.from(val256).eq(Util.max_uint256));

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.MUL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
      ]),
      val256, // val1
      val256, // val0
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0
        op(Opcode.VAL, 1), // val1
        op(Opcode.VAL, 2), // val0
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    // Just return the whole output stack for debugging purposes
    // const stack_ = await calculator.evalStack({ source, vals });

    // console.log(`stackVals_   ${stack_.vals}`);
    // console.log(`stackIndex_  ${stack_.index}`);

    const resultStack = await calculator.evalStack({ source, vals });

    console.log(resultStack);

    // const expectedStack = [
    //   640, 88, 490, 77, 360, 66, 250, 55, 160, 44, 90, 33, 40, 22, 10, 11, 0, 0,
    //   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    // ];

    // for (let i = 0; i < resultStack.length; i++) {
    //   const stackEl = resultStack.vals[i];

    //   assert(
    //     stackEl.eq(expectedStack[i]),
    //     `wrong result of call
    //     index     ${i}
    //     expected  ${expectedStack[i]}
    //     got       ${stackEl}`
    //   );
    // }
  });

  it("should handle a call which loops 4 times", async () => {
    this.timeout(0);

    // zero-based counting
    const fnSize = 0;
    const loopSize = 3;
    const valSize = 1;

    const valBytes = 32 / Math.pow(2, loopSize); // 32-bit unsigned integer

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.MUL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
      ]),
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
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0
        op(Opcode.VAL, 1), // val1
        op(Opcode.VAL, 2), // val0
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    // Just return the whole output stack for debugging purposes
    // const stack_ = await calculator.evalStack({ source, vals });

    // console.log(`stackVals_   ${stack_.vals}`);
    // console.log(`stackIndex_  ${stack_.index}`);

    const resultStack = await calculator.evalStack({ source, vals });

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

    for (let i = 0; i < resultStack.length; i++) {
      const stackEl = resultStack.vals[i];

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
    const fnSize = 0;
    const loopSize = 1;
    const valSize = 2;

    const valBytes = 32 / Math.pow(2, loopSize); // 128-bit unsigned

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.MUL, 3),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
      ]),
      concat([bytify(3, valBytes), bytify(1, valBytes)]),
      concat([bytify(4, valBytes), bytify(2, valBytes)]),
      concat([bytify(5, valBytes), bytify(3, valBytes)]),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0
        op(Opcode.VAL, 1), // val2
        op(Opcode.VAL, 2), // val1
        op(Opcode.VAL, 3), // val0
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    const resultStack = await calculator.evalStack({ source, vals });

    const expectedMul1 = 6;
    const actualMul1 = resultStack.vals[0];
    assert(
      actualMul1.eq(expectedMul1),
      `wrong result of call (* 1 2 3)
      expected  ${expectedMul1}
      got       ${actualMul1}`
    );

    const expectedAdd1 = 6;
    const actualAdd1 = resultStack.vals[1];
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of call (+ 1 2 3)
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedMul0 = 60;
    const actualMul0 = resultStack.vals[2];
    assert(
      actualMul0.eq(expectedMul0),
      `wrong result of call (* 3 4 5)
      expected  ${expectedMul0}
      got       ${actualMul0}`
    );

    const expectedAdd0 = 12;
    const actualAdd0 = resultStack.vals[3];
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of call (+ 3 4 5)
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a call op with maxed fnSize and valSize", async () => {
    this.timeout(0);

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 30),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 7),
      ]),
      concat([
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.ADD, 32), // max no. items
      ]),
      concat([
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      concat([
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 7),
        op(Opcode.VAL, 6),
        op(Opcode.VAL, 5),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      80,
      70,
      60,
      50,
      40,
      30,
      20,
      10,
      0,
      0,
      0,
      0,
    ];

    // zero-based counting
    const fnSize = 3;
    const loopSize = 0;
    const valSize = 7;

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn3
        op(Opcode.VAL, 1), // fn2
        op(Opcode.VAL, 2), // fn1
        op(Opcode.VAL, 3), // fn0
        op(Opcode.VAL, 4), // val7
        op(Opcode.VAL, 5), // val6
        op(Opcode.VAL, 6), // val5
        op(Opcode.VAL, 7), // val4
        op(Opcode.VAL, 8), // val3
        op(Opcode.VAL, 9), // val2
        op(Opcode.VAL, 10), // val1
        op(Opcode.VAL, 11), // val0
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    // Just return the whole output stack for debugging purposes
    // const stack_ = await calculator.evalStack({ source, vals });

    // console.log(`stackVals_   ${stack_.vals}`);
    // console.log(`stackIndex_  ${stack_.index}`);

    const resultStack = await calculator.evalStack({ source, vals });

    const expectedIndex = 2;
    const actualIndex = resultStack.index;
    assert(
      actualIndex === expectedIndex,
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedAdd1 = 1440;
    const actualAdd1 = resultStack.vals[0];
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of call
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedAdd0 = 1290;
    const actualAdd0 = resultStack.vals[1];
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of call
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a call op which runs multiple functions (across multiple fn vals)", async () => {
    this.timeout(0);

    const vals: Util.Vals = [
      concat([
        // ADD
        // 2 1, 3 2 1, 3 2 1, 3 2 1, 3 2 1 => 27
        op(Opcode.ADD, 14),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
      ]),
      concat([
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        // MUL
        op(Opcode.MUL, 3),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
      ]),
      3,
      2,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    // zero-based counting
    const fnSize = 1;
    const loopSize = 0;
    const valSize = 2;

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn1
        op(Opcode.VAL, 1), // fn0
        op(Opcode.VAL, 2), // val2
        op(Opcode.VAL, 3), // val1
        op(Opcode.VAL, 4), // val0
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    const resultStack = await calculator.evalStack({ source, vals });

    const expectedIndex = 2;
    const actualIndex = resultStack.index;
    assert(
      actualIndex === expectedIndex,
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 6;
    const actualMul = resultStack.vals[0];
    assert(
      actualMul.eq(expectedMul),
      `wrong result of call
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 27;
    const actualAdd = resultStack.vals[1];
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of call
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a call op which runs multiple functions (within single fn val)", async () => {
    this.timeout(0);

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.MUL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      3,
      4,
      5,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    // zero-based counting
    const fnSize = 0;
    const loopSize = 0;
    const valSize = 2;

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 3),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    const resultStack = await calculator.evalStack({ source, vals });

    const expectedIndex = 2;
    const actualIndex = resultStack.index;
    assert(
      actualIndex === expectedIndex,
      `wrong index for call
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 60;
    const actualMul = resultStack.vals[0];
    assert(
      actualMul.eq(expectedMul),
      `wrong result of call (* 3 4 5)
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 12;
    const actualAdd = resultStack.vals[1];
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of call (+ 3 4 5)
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a simple call op", async () => {
    this.timeout(0);

    const vals: Util.Vals = [
      concat([
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
      ]),
      1,
      2,
      3,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const fnSize = 0; // 1
    const loopSize = 0; // 1
    const valSize = 2; // 3

    const source: Util.Source = [
      concat([
        op(Opcode.ZIPMAP, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 3),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest & Contract;

    const result = await calculator.eval({ source, vals });
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

    const vals = [1, 2, 3, 4, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (* (+ 3 4 (- 2 1)) (/ 6 3) B)
        op(Opcode.MUL, 3),
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 3),
        op(Opcode.SUB, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.DIV, 2),
        op(Opcode.VAL, 4),
        op(Opcode.VAL, 2),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (/ (* (+ 2 2 2) 3) 2 3)
        op(Opcode.DIV, 3),
        op(Opcode.MUL, 2),
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
        op(Opcode.VAL, 1),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [3, 2, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (% 13 2 3)
        op(Opcode.MOD, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [3, 2, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (/ 12 2 3)
        op(Opcode.DIV, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [5, 4, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (* 3 4 5)
        op(Opcode.MUL, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [3, 2, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (- 10 2 3)
        op(Opcode.SUB, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
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

    const vals = [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // (+ 1 2 3)
        op(Opcode.ADD, 3),
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    const result = await calculator.run();
    const expected = 6;
    assert(result.eq(expected), `wrong summation ${expected} ${result}`);
  });

  it("should compile a basic program (store some numbers in val0 and val1)", async () => {
    this.timeout(0);

    const vals = [255, 256, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // 255 256
        op(Opcode.VAL, 1),
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    const actualVal0 = await calculator.val0();
    const compiledSource = await calculator.source0();
    assert(
      actualVal0.eq(vals[0]),
      `wrong val0
      source    ${hexlify(source[0])}
      compiled  ${hexlify(compiledSource)}
      expected  ${hexlify(vals[0])}
      got       ${hexlify(actualVal0)}`
    );
    const actualVal1 = await calculator.val1();
    assert(
      actualVal1.eq(vals[1]),
      `wrong val1
      source    ${hexlify(source[0])}
      compiled  ${hexlify(compiledSource)}
      expected  ${hexlify(vals[1])}
      got       ${hexlify(actualVal1)}`
    );
  });

  it("should compile a basic program (store a large number in val0)", async () => {
    this.timeout(0);

    const vals = [123456789, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // 123456789
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    const actualVal0 = await calculator.val0();
    assert(
      actualVal0.eq(vals[0]),
      `wrong val0
      source    ${hexlify(source[0])}
      expected  ${vals[0]}
      got       ${actualVal0}`
    );
  });

  it("should compile a basic program (store a small number in val0)", async () => {
    this.timeout(0);

    const vals = [255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [
      concat([
        // 255
        op(Opcode.VAL, 0),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    const actualVal0 = await calculator.val0();
    assert(
      actualVal0.eq(vals[0]),
      `wrong val0
      source    ${hexlify(source[0])}
      expected  ${vals[0]}
      got       ${actualVal0}`
    );
  });

  it("should make constants publically available on construction", async () => {
    this.timeout(0);

    const source = [0, 0, 0, 0];
    const vals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source,
      vals,
    })) as CalculatorTest & Contract;

    await getConstants(calculator);
  });
});

const getConstants = async (calculator: CalculatorTest) => `Constants:
MAX_SOURCE_LENGTH           ${await calculator.MAX_SOURCE_LENGTH()}

val0                        ${await calculator.val0()}
val1                        ${await calculator.val1()}
val2                        ${await calculator.val2()}
val3                        ${await calculator.val3()}
val4                        ${await calculator.val4()}
val5                        ${await calculator.val5()}
val6                        ${await calculator.val6()}
val7                        ${await calculator.val7()}
val8                        ${await calculator.val8()}
val9                        ${await calculator.val9()}
val10                       ${await calculator.val10()}
val11                       ${await calculator.val11()}
val12                       ${await calculator.val12()}

source0                     ${await calculator.source0()}
source1                     ${await calculator.source1()}
source2                     ${await calculator.source2()}
source3                     ${await calculator.source3()}`;
