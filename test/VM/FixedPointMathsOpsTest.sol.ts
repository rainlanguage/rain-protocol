import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract } from "ethers";

import type { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";

const { assert } = chai;

const Opcode = Util.AllStandardOps;

describe("FixedPointMathOps Test", async function () {
  let stateBuilder;
  let logic;
  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder = await stateBuilderFactory.deploy();
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest & Contract;
  });

  it("should scale an arbitrary fixed point number DOWN by scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.sixZeros);
    const n = 0xfc; // -4

    const constants = [value1];
    const v1 = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE_BY, n)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(100);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an arbitrary fixed point number UP by scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.sixZeros);
    const n = 0x04; // 4

    const constants = [value1];
    const v1 = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE_BY, n)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(1 + Util.sixZeros + "0000");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number UP to scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.eighteenZeros);
    const n = 20;

    const constants = [value1];
    const v1 = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALEN, n)
      ]),
    ];
    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(1 + Util.eighteenZeros + "00");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number DOWN to scale N", async () => {
    this.timeout(0);

    const value1 = ethers.BigNumber.from(1 + Util.eighteenZeros);
    const n = 6;

    const constants = [value1];
    const v1 = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALEN, n)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(1 + Util.sixZeros);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while dividing", async () => {
    this.timeout(0);

    const value1 = 50;
    const value2 = ethers.BigNumber.from("3" + Util.eighteenZeros);

    const constants = [value1, value2];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          v1,
          v2,
        op(Opcode.SCALE18_DIV)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(value1 + Util.eighteenZeros)
      .mul(Util.ONE)
      .div(value2);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while multiplying", async () => {
    this.timeout(0);

    const value1 = 1;
    const value2 = Util.ONE.mul(2);

    const constants = [value1, value2];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          v1,
          v2,
        op(Opcode.SCALE18_MUL)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(value1 + Util.eighteenZeros)
      .mul(value2)
      .div(Util.ONE);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM in situ", async () => {
    this.timeout(0);

    const value = 1;

    const constants = [value];
    const v1 = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          v1,
        op(Opcode.SCALE18)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(value + Util.eighteenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });
});
