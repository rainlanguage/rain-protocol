import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract } from "ethers";

import type { CalculatorTest } from "../../typechain/CalculatorTest";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  DEBUG,
  BLOCK_NUMBER,
  BLOCK_TIMESTAMP,
  SENDER,
  THIS,
  ADD,
  SATURATING_ADD,
  SUB,
  SATURATING_SUB,
  MUL,
  SATURATING_MUL,
  DIV,
  MOD,
  POW,
  MIN,
  MAX,
}

describe("CalculatorTestUnchecked", async function () {
  it("should panic when accumulator overflows with exponentiation op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    const constants = [Util.max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(Opcode.VAL, 0);
    const vTwo = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.POW, 2)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
    })) as CalculatorTest & Contract;

    await Util.assertError(
      async () => await calculator0.runState(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    const constants = [Util.max_uint256.div(2), 3];

    const vHalfMaxUInt256 = op(Opcode.VAL, 0);
    const vThree = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
    })) as CalculatorTest & Contract;

    await Util.assertError(
      async () => await calculator0.runState(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    const constants = [0, 1];

    const vZero = op(Opcode.VAL, 0);
    const vOne = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
    })) as CalculatorTest & Contract;

    await Util.assertError(
      async () => await calculator0.runState(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("CalculatorTest");

    const constants = [Util.max_uint256, 1];

    const vMaxUInt256 = op(Opcode.VAL, 0);
    const vOne = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
    })) as CalculatorTest & Contract;

    await Util.assertError(
      async () => await calculator0.runState(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });
});
