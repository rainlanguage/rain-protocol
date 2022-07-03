import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { eighteenZeros, ONE, sixZeros } from "../../../../utils/constants";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("RainVM fixed point math ops", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should scale an arbitrary fixed point number DOWN by scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + sixZeros);
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
    const value1 = ethers.BigNumber.from(1 + sixZeros);
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
    const expected0 = ethers.BigNumber.from(1 + sixZeros + "0000");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number UP to scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
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
    const expected0 = ethers.BigNumber.from(1 + eighteenZeros + "00");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number DOWN to scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
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
    const expected0 = ethers.BigNumber.from(1 + sixZeros);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while dividing", async () => {
    const value1 = 50;
    const value2 = ethers.BigNumber.from("3" + eighteenZeros);

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
    const expected0 = ethers.BigNumber.from(value1 + eighteenZeros)
      .mul(ONE)
      .div(value2);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while multiplying", async () => {
    const value1 = 1;
    const value2 = ONE.mul(2);

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
    const expected0 = ethers.BigNumber.from(value1 + eighteenZeros)
      .mul(value2)
      .div(ONE);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM in situ", async () => {
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
    const expected0 = ethers.BigNumber.from(value + eighteenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });
});
