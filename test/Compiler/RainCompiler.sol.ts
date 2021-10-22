import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { bytify } from "../Util";

import type { CalculatorTest } from "../../typechain/CalculatorTest";

chai.use(solidity);
const { expect, assert } = chai;

const enum Opcode {
  END,
  LIT,
  ARG,
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
  it("should calculate a mathematical expression (division, product, summation)", async () => {
    this.timeout(0);

    const source = concat([
      // (/ (* (+ 2 2 2) 3) 2 3)
      bytify(Opcode.DIV),
      bytify(3),
      bytify(Opcode.MUL),
      bytify(2),
      bytify(Opcode.ADD),
      bytify(3),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(2, 32),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(2, 32),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(2, 32),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(3, 32),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(2, 32),
      bytify(Opcode.LIT),
      bytify(0),
      bytify(3, 32),
      bytify(Opcode.END),
      bytify(0),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    console.log(`${hexlify(await calculator.source0())}`);
  });

  it("should add a sequence of numbers together", async () => {
    this.timeout(0);

    const source = concat([
      // (+ 1 2 3)
      bytify(Opcode.ADD), //  06
      bytify(3), //           03
      bytify(Opcode.LIT), //  03
      bytify(0), //           00
      bytify(1, 32), //       -> val0
      bytify(Opcode.LIT), //  03
      bytify(0), // ->        01
      bytify(2, 32), //       -> val1
      bytify(Opcode.LIT), //  03
      bytify(0), //           02
      bytify(3, 32), //       -> val2
      bytify(Opcode.END), //  00
      bytify(0), //           00
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    console.log(`${hexlify(await calculator.source0())}`);

    const result = await calculator.run();

    console.log(`${hexlify(result)}`);
  });

  it("should compile a basic program (store some numbers in val0 and val1)", async () => {
    this.timeout(0);

    const value0 = 255;
    const value1 = 256;

    const litVal0 = bytify(value0, 32);
    const litVal1 = bytify(value1, 32);

    const source = concat([
      bytify(Opcode.LIT),
      bytify(0),
      litVal0,
      bytify(Opcode.LIT),
      bytify(0),
      litVal1,
      bytify(Opcode.END),
      bytify(0),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    const actualVal0 = await calculator.val0();
    const compiledSource = await calculator.source0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      source    ${hexlify(source)}
      compiled  ${hexlify(compiledSource)}
      expected  ${hexlify(value0)}
      got       ${hexlify(actualVal0)}`
    );
    const actualVal1 = await calculator.val1();
    assert(
      actualVal1.eq(value1),
      `wrong val1
      source    ${hexlify(source)}
      compiled  ${hexlify(compiledSource)}
      expected  ${hexlify(value1)}
      got       ${hexlify(actualVal1)}`
    );
  });

  it("should compile a basic program (store a large number in val0)", async () => {
    this.timeout(0);

    const value0 = 123456789;

    const litVal0 = bytify(value0, 32);

    const source = concat([
      bytify(Opcode.LIT),
      bytify(0),
      litVal0,
      bytify(Opcode.END),
      bytify(0),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    const actualVal0 = await calculator.val0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      source    ${hexlify(source)}
      expected  ${value0}
      got       ${actualVal0}`
    );
  });

  it("should compile a basic program (store a small number in val0)", async () => {
    this.timeout(0);

    const value0 = 255;

    const litVal0 = bytify(value0, 32);

    const source = concat([
      bytify(Opcode.LIT),
      bytify(0),
      litVal0,
      bytify(Opcode.END),
      bytify(0),
    ]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    const actualVal0 = await calculator.val0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      source    ${hexlify(source)}
      expected  ${value0}
      got       ${actualVal0}`
    );
  });

  it("should make constants publically available on construction", async () => {
    this.timeout(0);

    const source = new Uint8Array([]);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");
    const calculator = (await calculatorFactory.deploy(
      source
    )) as CalculatorTest;

    await getConstants(calculator);
  });
});

const getConstants = async (calculator: CalculatorTest) => `Constants:
MAX_COMPILED_SOURCE_LENGTH  ${await calculator.MAX_COMPILED_SOURCE_LENGTH()}
LIT_SIZE_BYTES              ${await calculator.LIT_SIZE_BYTES()}

OPCODE_END                  ${await calculator.OPCODE_END()}
OPCODE_LIT                  ${await calculator.OPCODE_LIT()}
OPCODE_ARG                  ${await calculator.OPCODE_ARG()}

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
