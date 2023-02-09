import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../../typechain";
import { zeroPad32, paddedUInt32 } from "../../../../utils/bytes";
import { combineTierDeploy } from "../../../../utils/deploy/tier/combineTier/deploy";
import { readWriteTierDeploy } from "../../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp, timewarp } from "../../../../utils/hardhat";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  selectLte,
  SelectLteLogic,
  SelectLteMode,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { ALWAYS, NEVER, numArrayToReport } from "../../../../utils/tier";
import { Tier } from "../../../../utils/types/tier";

const Opcode = AllStandardOps;

describe("CombineTier tierwise combine report with 'any' logic and 'first' mode", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.context, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.context, 0x0001),
      ctxAccount,
    op(Opcode.itierV2Report),
  ]);

  it("should correctly combine reports with any and first selector where first report contains tier values which are greater than block timestamp", async () => {
    const signers = await ethers.getSigners();

    await timewarp(5);

    // timestamp in the past
    const timestamp0 = (await getBlockTimestamp()) - 1;
    // timestamp in the future
    const timestamp1 = (await getBlockTimestamp()) + 100;

    const evaluableConfigFuture = await generateEvaluableConfig({
      sources: [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      constants: [
        numArrayToReport([
          timestamp0,
          timestamp0,
          timestamp1,
          timestamp1,
          timestamp0,
          timestamp0,
          timestamp1,
          timestamp1,
        ]),
      ],
    });
    const futureTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigFuture,
    })) as CombineTier;

    const evaluableConfigAlways = await generateEvaluableConfig({
      sources: [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      constants: [ALWAYS],
    });
    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigAlways,
    })) as CombineTier;

    const evaluableConfigNever = await generateEvaluableConfig({
      sources: [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      constants: [NEVER],
    });
    const neverTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigNever,
    })) as CombineTier;

    const constants = [
      ethers.BigNumber.from(futureTier.address),
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const vFuture = concat([
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.context, 0x0000),
      op(Opcode.itierV2Report, 0),
    ]);
    // prettier-ignore
    const vAlways = concat([
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.context, 0x0000),
      op(Opcode.itierV2Report, 0),
    ]);
    // prettier-ignore
    const vNever = concat([
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.context, 0x0000),
      op(Opcode.itierV2Report, 0),
    ]);

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.blockTimestamp),
        vFuture,
        vAlways,
        vNever,
      op(
        Opcode.selectLte,
        selectLte(SelectLteLogic.any, SelectLteMode.first, 3)
      ),
    ]);

    const evaluableConfigCombine = await generateEvaluableConfig({
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    });
    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 3,
      evaluableConfig: evaluableConfigCombine,
    })) as CombineTier;

    const result = await combineTier.report(signers[0].address, []);

    const expected = numArrayToReport([
      timestamp0,
      timestamp0,
      0,
      0,
      timestamp0,
      timestamp0,
      0,
      0,
    ]);
    assert(
      result.eq(expected),
      `did not correctly combine reports with any and first selector where first report contains tier values which are greater than block timestamp
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine Always and Never tier reports with any and first selector", async () => {
    const signers = await ethers.getSigners();

    const evaluableConfigAlways = await generateEvaluableConfig({
      sources: [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      constants: [ALWAYS],
    });
    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigAlways,
    })) as CombineTier;

    const evaluableConfigNever = await generateEvaluableConfig({
      sources: [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      constants: [NEVER],
    });
    const neverTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigNever,
    })) as CombineTier;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.blockTimestamp),
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.context, 0x0000),
        op(Opcode.itierV2Report, 0),
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.context, 0x0000),
        op(Opcode.itierV2Report, 0),
      op(
        Opcode.selectLte,
        selectLte(SelectLteLogic.any, SelectLteMode.first, 2)
      ),
    ]);
    const evaluableConfigCombine = await generateEvaluableConfig({
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    });
    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      evaluableConfig: evaluableConfigCombine,
    })) as CombineTier;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_LEFT succeeds

    const expected = 0x00; // success, left report's block timestamp for each tier
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise any and first selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with any and first selector", async () => {
    const signers = await ethers.getSigners();

    const readWriteTierRight = await readWriteTierDeploy();
    const readWriteTierLeft = await readWriteTierDeploy();

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
    ];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.blockTimestamp),
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.context, 0x0000),
        op(Opcode.itierV2Report),
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.context, 0x0000),
        op(Opcode.itierV2Report),
      op(
        Opcode.selectLte,
        selectLte(SelectLteLogic.any, SelectLteMode.first, 2)
      ),
    ]);

    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    });
    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      evaluableConfig,
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

    const rightReport = zeroPad32(
      await readWriteTierRight.report(signers[0].address, [])
    );
    const expectedRightReport = zeroPad32(
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

    const leftReport = zeroPad32(
      await readWriteTierLeft.report(signers[0].address, [])
    );
    const expectedLeftReport = zeroPad32(
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

    const resultOrLeft = zeroPad32(
      await combineTier.report(signers[0].address, [])
    );
    const expectedOrLeft = zeroPad32(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 9) +
          paddedUInt32(startTimestamp + 8) +
          paddedUInt32(startTimestamp + 7) +
          paddedUInt32(startTimestamp + 6) +
          paddedUInt32(startTimestamp + 5) +
          paddedUInt32(startTimestamp + 4)
      )
    );
    assert(
      resultOrLeft === expectedOrLeft,
      `wrong block timestamp preserved with tierwise any and first selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrLeft}
      got       ${resultOrLeft}`
    );
  });
});
