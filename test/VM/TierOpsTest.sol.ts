import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { op } from "../Util";
import { BigNumber, Contract } from "ethers";

import type { TierOpsTest } from "../../typechain/TierOpsTest";
import { tierRange } from "../Claim/ClaimUtil";

const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  REPORT,
  NEVER,
  ALWAYS,
  SATURATING_DIFF,
  UPDATE_BLOCKS_FOR_TIER_RANGE,
  SELECT_LTE,
}

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

describe("TierOpsTest", async function () {
  it("should use saturating sub for diff (does not panic when underflowing)", async () => {
    throw new Error("Unimplemented");
  });

  it("should diff reports correctly", async () => {
    this.timeout(0);

    const tierOpsFactory = await ethers.getContractFactory("TierOpsTest");

    const constants0 = [
      Util.blockNumbersToReport([0, 0, 0, 0, 0, 7, 8, 9].reverse()),
      Util.blockNumbersToReport([0, 0, 0, 0, 0, 5, 6, 7].reverse()),
    ]; // is something fishy going on here?

    const vReport0 = op(Opcode.VAL, 0);
    const vReport1 = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    const tierOps0 = (await tierOpsFactory.deploy({
      sources: [source0],
      constants: constants0,
      argumentsLength: 0,
      stackLength: 10,
    })) as TierOpsTest & Contract;

    const result0 = await tierOps0.run(); // 0x470de500000000
    const resultHex0 = hexlify(result0);
    const state0 = await tierOps0.runState();

    console.log({ result: result0, resultHex: resultHex0, state: state0 });

    const expectedResult0 = "0x20000000200000002";

    assert(
      resultHex0 === expectedResult0,
      `wrong report diff
      expected  ${expectedResult0}
      got       ${resultHex0}`
    );
  });
});
