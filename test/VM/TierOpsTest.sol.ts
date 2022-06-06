import * as Util from "../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { op, AllStandardOps } from "../../utils";
import { Contract } from "ethers";

import type { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";
import { AllStandardOpsStateBuilder } from "../../typechain/AllStandardOpsStateBuilder";

const Opcode = AllStandardOps;

enum Tier {
  ZERO,
  ONE, // bronze
  TWO, // silver
  THREE, // gold
  FOUR, // platinum
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

function tierRangeUnrestricted(startTier: number, endTier: number): number {
  //   op_.val & 0x0f, //     00001111
  //   op_.val & 0xf0, //     11110000
  let range = endTier;
  range <<= 4;
  range += startTier;
  return range;
}

describe("TierOps", async function () {
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

  it("should enforce maxTier for update tier range operation", async () => {
    this.timeout(0);

    await Util.createEmptyBlock(3);

    const block = await ethers.provider.getBlockNumber();

    const constants0 = [block, Util.NEVER];

    const vBlock = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const source0 = concat([
        op(Opcode.CONSTANT, 1),
        vBlock,
      op(
        Opcode.UPDATE_TIMES_FOR_TIER_RANGE,
        tierRangeUnrestricted(Tier.ZERO, 9) // beyond max tier of Tier.EIGHT
      ),
    ]);

    await logic.initialize({
      sources: [source0],
      constants: constants0,
    });

    await Util.assertError(
      async () => await logic.run(),
      "MAX_TIER",
      "wrongly updated blocks with endTier of 9, which is greater than maxTier constant"
    );
  });

  it("should use saturating sub for diff where only some tiers would underflow", async () => {
    this.timeout(0);

    const constants0 = [
      //         0x01000000020000000300000004000000050000000600000007
      Util.numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
      // 0x0200000000000000040000000000000006000000000000000800000000
      Util.numArrayToReport([2, 0, 4, 0, 6, 0, 8, 0].reverse()),
    ];

    const vReport0 = op(Opcode.CONSTANT, 0);
    const vReport1 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    const expectedResultHex0 =
      "0x01000000000000000300000000000000050000000000000007";

    assert(
      resultHex0 === expectedResultHex0,
      `wrong report diff
      expected  ${expectedResultHex0}
      got       ${resultHex0}`
    );
  });

  it("should use saturating sub for diff (does not panic when underflowing, but sets to zero)", async () => {
    this.timeout(0);

    const constants0 = [
      // 0x01000000020000000300000004000000050000000600000007
      Util.numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
      // 0x0200000003000000040000000500000006000000070000000800000009
      Util.numArrayToReport([2, 3, 4, 5, 6, 7, 8, 9].reverse()),
    ];

    const vReport0 = op(Opcode.CONSTANT, 0);
    const vReport1 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    assert(
      result0.isZero(),
      `wrong report diff
      expected  ${0x00}
      got       ${resultHex0}`
    );
  });

  it("should diff reports correctly", async () => {
    this.timeout(0);

    const constants0 = [
      // 0x0200000003000000040000000500000006000000070000000800000009
      Util.numArrayToReport([2, 3, 4, 5, 6, 7, 8, 9].reverse()),
      // 0x01000000020000000300000004000000050000000600000007
      Util.numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
    ];

    const vReport0 = op(Opcode.CONSTANT, 0);
    const vReport1 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    const expectedResultHex0 =
      "0x0200000002000000020000000200000002000000020000000200000002";

    assert(
      resultHex0 === expectedResultHex0,
      `wrong report diff
      expected  ${expectedResultHex0}
      got       ${resultHex0}`
    );
  });
});
