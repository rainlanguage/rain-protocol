import { assert } from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import type { Contract } from "ethers";
import type { CombineTier } from "../../../../typechain/CombineTier";
import type { ReadWriteTier } from "../../../../typechain/ReadWriteTier";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import {
  op,
  selectLte,
  selectLteLogic,
  selectLteMode,
} from "../../../../utils/rainvm/vm";
import { getBlockTimestamp } from "../../../../utils/hardhat";
import { combineTierDeploy } from "../../../../utils/deploy/combineTier";
import { ALWAYS, NEVER } from "../../../../utils/tier";
import { Tier } from "../../../../utils/types/tier";
import { paddedUInt256, paddedUInt32 } from "../../../../utils/bytes";
import { max_uint256 } from "../../../../utils/constants";

export const Opcode = AllStandardOps;

describe("CombineTier tierwise combine report with 'every' logic and 'min' mode", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.REPORT),
  ]);

  it("should correctly combine Always and Never tier reports with every and min selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [NEVER],
      },
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceReport = concat([
            op(Opcode.CONSTANT, 0),
            op(Opcode.CONTEXT, 0),
          op(Opcode.REPORT, 0),
            op(Opcode.CONSTANT, 1),
            op(Opcode.CONTEXT, 0),
          op(Opcode.REPORT, 0),
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.every, selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_OLD fails

    const expected = max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise every and min selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with every and min selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
    ];

    // prettier-ignore
    const sourceReport = concat([
          op(Opcode.CONSTANT, 1),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
          op(Opcode.CONSTANT, 0),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.every, selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const startTimestamp = await getBlockTimestamp();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address, [])
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 12) +
          paddedUInt32(startTimestamp + 11) +
          paddedUInt32(startTimestamp + 10) +
          paddedUInt32(startTimestamp + 3) +
          paddedUInt32(startTimestamp + 2) +
          paddedUInt32(startTimestamp + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address, [])
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startTimestamp + 9) +
          paddedUInt32(startTimestamp + 8) +
          paddedUInt32(startTimestamp + 7) +
          paddedUInt32(startTimestamp + 6) +
          paddedUInt32(startTimestamp + 5) +
          paddedUInt32(startTimestamp + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndOld = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedAndOld = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startTimestamp + 9) +
          paddedUInt32(startTimestamp + 8) +
          paddedUInt32(startTimestamp + 7) +
          paddedUInt32(startTimestamp + 3) +
          paddedUInt32(startTimestamp + 2) +
          paddedUInt32(startTimestamp + 1)
      )
    );
    assert(
      resultAndOld === expectedAndOld,
      `wrong block timestamp preserved with tierwise every and min selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndOld}
      got       ${resultAndOld}`
    );
  });
});
