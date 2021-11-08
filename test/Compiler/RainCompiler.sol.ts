import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { bytify, callSize, op } from "../Util";

import type { CalculatorTest } from "../../typechain/CalculatorTest";

chai.use(solidity);
const { expect, assert } = chai;

const enum Opcode {
  END,
  VAL,
  CALL,
  BLOCK_NUMBER,
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
}

describe("RainCompiler", async function () {
  it("should handle a call op which runs multiple functions (across multiple fn vals)", async () => {
    this.timeout(0);

    const vals = [
      concat([
        // ADD
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
    ];

    // zero-based counting
    const fnSize = 1;
    const loopSize = 0;
    const valSize = 2;

    const source = [
      concat([
        op(Opcode.CALL, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn1
        op(Opcode.VAL, 1), // fn0
        op(Opcode.VAL, 2),
        op(Opcode.VAL, 3),
        op(Opcode.VAL, 4),
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest;

    // @ts-ignore
    // Just return the whole output stack for debugging purposes
    const stack_ = await calculator.evalStack({ source, vals });

    console.log(`stackVals_   ${stack_.vals}`);
    console.log(`stackIndex_  ${stack_.index}`);

    // @ts-ignore
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

    const vals = [
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

    const source = [
      concat([
        op(Opcode.CALL, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0 reference
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
    })) as CalculatorTest;

    // @ts-ignore
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

    const vals = [
      concat([
        // fn0 definition with inner stack vals
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

    const source = [
      concat([
        op(Opcode.CALL, callSize(fnSize, loopSize, valSize)),
        op(Opcode.VAL, 0), // fn0 reference
        op(Opcode.VAL, 1), // val0 inner stack | val1 outer stack
        op(Opcode.VAL, 2), // val1 inner stack | val2 outer stack
        op(Opcode.VAL, 3), // val2 inner stack | val3 outer stack
      ]),
      0,
      0,
      0,
    ];

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy({
      source, // not important
      vals, // not important
    })) as CalculatorTest;

    // @ts-ignore
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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

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
    })) as CalculatorTest;

    await getConstants(calculator);
  });
});

const getConstants = async (calculator: CalculatorTest) => `Constants:
MAX_SOURCE_LENGTH           ${await calculator.MAX_SOURCE_LENGTH()}

OPCODE_END                  ${await calculator.OPCODE_END()}

OPCODE_VAL                  ${await calculator.OPCODE_VAL()}
OPCODE_CALL                 ${await calculator.OPCODE_CALL()}

OPCODE_BLOCK_NUMBER         ${await calculator.OPCODE_BLOCK_NUMBER()}

OPCODE_RESERVED_MAX         ${await calculator.OPCODE_RESERVED_MAX()}

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
