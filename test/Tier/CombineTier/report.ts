import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain/CombineTier";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { ALWAYS, NEVER } from "../../../utils/tier";

export const Opcode = AllStandardOps;

describe("CombineTier default report", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should support a program which returns the default report", async () => {
    const signers = await ethers.getSigners();

    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [ALWAYS],
      },
    })) as CombineTier;
    const neverTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [NEVER],
      },
    })) as CombineTier;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceAlwaysReport = concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceNeverReport = concat([
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierAlways = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceAlwaysReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier;

    const resultAlwaysReport = await combineTierAlways.report(
      signers[1].address,
      []
    );

    const expectedAlwaysReport = 0;
    assert(
      resultAlwaysReport.eq(expectedAlwaysReport),
      `wrong report
      expected  ${expectedAlwaysReport}
      got       ${resultAlwaysReport}`
    );

    const combineTierNever = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceNeverReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier;

    const resultNeverReport = await combineTierNever.report(
      signers[1].address,
      []
    );

    const expectedNeverReport = ethers.constants.MaxUint256;
    assert(
      resultNeverReport.eq(expectedNeverReport),
      `wrong report
      expected ${expectedNeverReport}
      got      ${resultNeverReport}`
    );
  });
});
