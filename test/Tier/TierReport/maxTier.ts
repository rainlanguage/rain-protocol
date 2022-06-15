import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../typechain/TierReportTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { timewarp } from "../../../utils/hardhat";
import { assertError } from "../../../utils/test/assertError";
import { Tier } from "../../../utils/types/tier";

describe("TierReport maxTier", async function () {
  let signer1: SignerWithAddress;
  let readWriteTier: ReadWriteTier;
  let tierReport: TierReportTest;

  beforeEach(async () => {
    [, signer1] = await ethers.getSigners();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    tierReport = (await basicDeploy("TierReportTest", {})) as TierReportTest;
  });

  it("should enforce maxTier for all TierReport logic", async () => {
    const initialBlock = await ethers.provider.getBlockNumber();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE, []);

    await timewarp(10);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    await timewarp(10);

    const report = await readWriteTier.report(signer1.address, []);

    // tierBlock()
    await assertError(
      async () => await tierReport.reportTimeForTier(report, 9),
      "MAX_TIER",
      "wrongly attempted to read tier '9' in the report, which is greater than maxTier constant"
    );

    // truncateTiersAbove()
    await assertError(
      async () => await tierReport.truncateTiersAbove(report, 9),
      "MAX_TIER",
      "wrongly attempted to truncate tiers above '9' in the report, which is greater than maxTier constant"
    );

    // updateTimeAtTier()
    await assertError(
      async () => await tierReport.updateTimeAtTier(report, 9, initialBlock),
      "MAX_TIER",
      "wrongly attempted to update block at tier '9' in the report, which is greater than maxTier constant"
    );

    // updateTimesForTierRange()
    await assertError(
      async () =>
        await tierReport.updateTimesForTierRange(report, 0, 9, initialBlock),
      "MAX_TIER",
      "wrongly attempted to update blocks from tier 0 to '9' in the report, which is greater than maxTier constant"
    );
  });
});
