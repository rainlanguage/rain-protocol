import { assert } from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import type { Contract } from "ethers";
import type { CombineTier } from "../../typechain/CombineTier";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { AllStandardOps } from "../../utils/rainvm/ops/allStandardOps";
import {
  op,
  selectLte,
  selectLteLogic,
  selectLteMode,
} from "../../utils/rainvm/vm";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { combineTierDeploy } from "../../utils/deploy/combineTier";
import { ALWAYS, NEVER, numArrayToReport } from "../../utils/tier";
import { max_uint256 } from "../../utils/constants";
import { Tier } from "../../utils/types/tier";
import { paddedUInt256, paddedUInt32 } from "../../utils/bytes";

export const Opcode = AllStandardOps;

describe("CombineTier", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);
  const ctxTier = op(Opcode.CONTEXT, 1);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.REPORT),
  ]);

  it("should support returning report time only for a specified tier", async () => {
    throw new Error("unimplemented");

    /*
    const signers = await ethers.getSigners();

    // prettier-ignore
    const sourceReportTimeForTier = concat([
          op(Opcode.THIS_ADDRESS),
          ctxAccount,
        op(Opcode.REPORT),
        ctxTier,
      op(Opcode.TIME_FOR_TIER), // some opcode like this
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTier],
        constants: [numArrayToReport([10, 20, 30, 40, 50, 60, 70, 80])],
      },
    })) as CombineTier & Contract;

    const timeForTierFive = await combineTier.reportTimeForTier(
      signers[1].address,
      Tier.FIVE,
      []
    );

    assert(
      timeForTierFive.eq(50),
      `wrong timestamp for Tier.FIVE
      expected  ${50}
      got       ${timeForTierFive}`
    );
    */
  });
});
