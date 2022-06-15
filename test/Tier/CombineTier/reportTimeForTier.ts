import { assert } from "chai";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain/CombineTier";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { numArrayToReport } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

export const Opcode = AllStandardOps;

describe("CombineTier report time for tier script", async function () {
  const CONST_REPORT_TIME_FOR_TIER = 123;

  it("should support returning report time for tier using VM script (e.g. constant timestamp value)", async () => {
    const signers = await ethers.getSigners();

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), op(Opcode.CONSTANT, 1)],
        constants: [
          numArrayToReport([10, 20, 30, 40, 50, 60, 70, 80]),
          CONST_REPORT_TIME_FOR_TIER, // just return a constant value
        ],
      },
    })) as CombineTier;

    const timeForTier = await combineTier.reportTimeForTier(
      signers[1].address,
      Tier.FIVE, // doesn't matter what tier as we return a constant
      []
    );

    assert(
      timeForTier.eq(CONST_REPORT_TIME_FOR_TIER),
      `wrong timestamp
      expected  ${CONST_REPORT_TIME_FOR_TIER}
      got       ${timeForTier}`
    );
  });
});
