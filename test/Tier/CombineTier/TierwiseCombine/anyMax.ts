import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../../typechain";
import { paddedUInt256, paddedUInt32 } from "../../../../utils/bytes";
import { combineTierDeploy } from "../../../../utils/deploy/tier/combineTier/deploy";
import { readWriteTierDeploy } from "../../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp } from "../../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
  selectLte,
  selectLteLogic,
  selectLteMode,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { ALWAYS, NEVER } from "../../../../utils/tier";
import { Tier } from "../../../../utils/types/tier";

const Opcode = AllStandardOps;

describe("CombineTier tierwise combine report with 'any' logic and 'max' mode", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.CONTEXT, 0x0001),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should correctly combine Always and Never tier reports with any and max selector", async () => {
    const signers = await ethers.getSigners();

    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      expressionConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;
    const neverTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      expressionConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [NEVER],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT, 0),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT, 0),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.any, selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      expressionConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_NEW succeeds

    const expected = 0x00; // success, newest block timestamp before current block for each tier
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise any and max selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with any and max selector", async () => {
    const signers = await ethers.getSigners();

    const readWriteTierRight = await readWriteTierDeploy();
    const readWriteTierLeft = await readWriteTierDeploy();

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
    ];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.any, selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      expressionConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const startTimestamp = await getBlockTimestamp();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT);

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

    const resultOrNew = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedOrNew = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 12) +
          paddedUInt32(startTimestamp + 11) +
          paddedUInt32(startTimestamp + 10) +
          paddedUInt32(startTimestamp + 6) +
          paddedUInt32(startTimestamp + 5) +
          paddedUInt32(startTimestamp + 4)
      )
    );
    assert(
      resultOrNew === expectedOrNew,
      `wrong block timestamp preserved with tierwise any and max selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrNew}
      got       ${resultOrNew}`
    );
  });
});
