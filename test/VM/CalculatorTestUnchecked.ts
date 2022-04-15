import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract } from "ethers";

import type { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { assert } = chai;

const Opcode = Util.AllStandardOps;

describe("CalculatorTestUnchecked", async function () {
  it("should panic when accumulator overflows with exponentiation op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [Util.max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(Opcode.VAL, 0);
    const vTwo = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.EXP, 2)
    ]);

    const calculator0 = (await calculatorFactory.deploy({
      sources: [source0],
      constants,
    })) as AllStandardOpsTest & Contract;

    await Util.assertError(
      async () => await calculator0.run(await calculator0.fnPtrs()),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("AllStandardOpsTest");

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
    })) as AllStandardOpsTest & Contract;

    await Util.assertError(
      async () => await calculator0.run(await calculator0.fnPtrs()),
      "Transaction reverted",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("AllStandardOpsTest");

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
    })) as AllStandardOpsTest & Contract;

    await Util.assertError(
      async () => await calculator0.run(await calculator0.fnPtrs()),
      "Transaction reverted",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    this.timeout(0);

    const calculatorFactory = await ethers.getContractFactory("AllStandardOpsTest");

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
    })) as AllStandardOpsTest & Contract;

    await Util.assertError(
      async () => await calculator0.run(await calculator0.fnPtrs()),
      "Transaction reverted",
      "accumulator overflow did not panic"
    );
  });
});
