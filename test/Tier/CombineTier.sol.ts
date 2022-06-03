import * as Util from "../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import {
  op,
  paddedUInt32,
  paddedUInt256,
  getBlockTimestamp,
  timewarp,
} from "../../utils";
import type { Contract } from "ethers";

import type { CombineTier } from "../../typechain/CombineTier";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";

enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

export const Opcode = Util.AllStandardOps;

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

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTier],
        constants: [Util.numArrayToReport([10, 20, 30, 40, 50, 60, 70, 80])],
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

  it("should correctly combine reports with every and first selector where first report contains tier values which are greater than block timestamp", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    await timewarp(5);

    // timestamp in the past
    const timestamp0 = (await getBlockTimestamp()) - 1;
    // timestamp in the future
    const timestamp1 = (await getBlockTimestamp()) + 100;

    const futureTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [
          Util.numArrayToReport([
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
      },
    })) as CombineTier & Contract;
    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
      },
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(futureTier.address),
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const vFuture = concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);
    // prettier-ignore
    const vAlways = concat([
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);
    // prettier-ignore
    const vNever = concat([
        op(Opcode.CONSTANT, 2),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReport = concat([
          vFuture,
          vAlways,
          vNever,
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.first, 3)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 3,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `did not correctly combine reports with every and first selector where first report contains tier values which are greater than block timestamp
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine reports with any and first selector where first report contains tier values which are greater than block timestamp", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    await timewarp(5);

    // timestamp in the past
    const timestamp0 = (await getBlockTimestamp()) - 1;
    // timestamp in the future
    const timestamp1 = (await getBlockTimestamp()) + 100;

    const futureTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [
          Util.numArrayToReport([
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
      },
    })) as CombineTier & Contract;
    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
      },
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(futureTier.address),
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const vFuture = concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);
    // prettier-ignore
    const vAlways = concat([
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);
    // prettier-ignore
    const vNever = concat([
        op(Opcode.CONSTANT, 2),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReport = concat([
          vFuture,
          vAlways,
          vNever,
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.first, 3)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 3,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    const expected = Util.numArrayToReport([
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
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.first, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

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

  it("should correctly combine Always and Never tier reports with any and max selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

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

  it("should correctly combine Always and Never tier reports with any and min selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_OLD succeeds

    const expected = 0x00; // success, oldest block timestamp for each tier
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise any and min selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine Always and Never tier reports with every and first selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.first, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_LEFT fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise every and first selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine Always and Never tier reports with every and min selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_OLD fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise every and min selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should correctly combine Always and Never tier reports with every and max selector", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address, []);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_NEW fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block timestamp preserved with tierwise every and max selector
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should support a program which returns the default report", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.ALWAYS],
      },
    })) as CombineTier & Contract;
    const neverTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [Util.NEVER],
      },
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceAlwaysReport = concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);

    // prettier-ignore
    const sourceNeverReport = concat([
        op(Opcode.CONSTANT, 1),
        op(Opcode.CONTEXT, 0),
      op(Opcode.REPORT, 0),
    ]);

    const combineTierAlways = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceAlwaysReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

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

    const combineTierNever = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceNeverReport, sourceReportTimeForTierDefault],
        constants,
      },
    })) as CombineTier & Contract;

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

  it("should support a program which simply returns the account", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const sourceReport = concat([op(Opcode.CONTEXT, 0)]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants: [],
      },
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[1].address, []);
    const expected = signers[1].address;
    assert(
      result.eq(expected),
      `wrong account address
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

  it("should correctly combine ReadWriteTier tier contracts with every and max selector", async () => {
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

    const resultAndNew = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedAndNew = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startTimestamp + 12) +
          paddedUInt32(startTimestamp + 11) +
          paddedUInt32(startTimestamp + 10) +
          paddedUInt32(startTimestamp + 6) +
          paddedUInt32(startTimestamp + 5) +
          paddedUInt32(startTimestamp + 4)
      )
    );
    assert(
      resultAndNew === expectedAndNew,
      `wrong block timestamp preserved with tierwise every and max selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndNew}
      got       ${resultAndNew}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with every and first selector", async () => {
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
        Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.first, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

    const resultAndLeft = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedAndLeft = leftReport;
    assert(
      resultAndLeft === expectedAndLeft,
      `wrong block timestamp preserved with tierwise every and first selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndLeft}
      got       ${resultAndLeft}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with any and min selector", async () => {
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.min, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

    const resultOrOld = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedOrOld = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 13) +
          paddedUInt32(startTimestamp + 9) +
          paddedUInt32(startTimestamp + 8) +
          paddedUInt32(startTimestamp + 7) +
          paddedUInt32(startTimestamp + 3) +
          paddedUInt32(startTimestamp + 2) +
          paddedUInt32(startTimestamp + 1)
      )
    );
    assert(
      resultOrOld === expectedOrOld,
      `wrong block timestamp preserved with tierwise any and min selector
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrOld}
      got       ${resultOrOld}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with any and max selector", async () => {
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

  it("should correctly combine ReadWriteTier tier contracts with any and first selector", async () => {
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
        Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.first, 2)
      ),
    ]);

    const combineTier = (await Util.combineTierDeploy(signers[0], {
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

    const resultOrLeft = paddedUInt256(
      await combineTier.report(signers[0].address, [])
    );
    const expectedOrLeft = paddedUInt256(
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
