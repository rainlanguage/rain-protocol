import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../typechain/TierReportTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getBlockTimestamp } from "../../../utils/hardhat";
import { Tier } from "../../../utils/types/tier";

describe("TierReport updateTimesForTierRange", async function () {
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

  it("should set all tiers within a min/max tier range to the specified timestamp in a given report", async () => {
    const initialTime = await getBlockTimestamp();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    const report = await readWriteTier.report(signer1.address, []);

    const targetTime = initialTime + 1000;

    const updatedReportBadRange = await tierReport.updateTimesForTierRange(
      report,
      Tier.SEVEN,
      Tier.SIX,
      targetTime
    );

    // bad range should return original report
    assert(updatedReportBadRange.eq(report), "changed report with bad range");

    const updatedReport = await tierReport.updateTimesForTierRange(
      report,
      Tier.SIX, // smaller number first
      Tier.SEVEN,
      targetTime
    );

    const initialTimeHex = ethers.BigNumber.from(targetTime)
      .toHexString()
      .slice(2);

    const initialBlockHexFormatted =
      "0".repeat(8 - initialTimeHex.length) + initialTimeHex;

    const expectedUpdatedReport =
      report.toHexString().slice(0, 2 + 8) +
      initialBlockHexFormatted +
      report.toHexString().slice(18);

    assert(
      updatedReport.eq(expectedUpdatedReport),
      `got wrong updated report
      expected  ${expectedUpdatedReport}
      got       ${updatedReport.toHexString()}`
    );
  });
});
