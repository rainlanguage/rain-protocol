import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import { ReadWriteTier, TierReportTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import { Tier } from "../../../utils/types/tier";

describe("TierReport reportTimeForTier", async function () {
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

  it("should return the timestamp for a specified status according to a given report", async () => {
    // set status ONE
    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE);
    const expectedTier1Timestamp = await getBlockTimestamp();

    await timewarp(10);

    // set status TWO
    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO);
    const expectedTier2Block = await getBlockTimestamp();

    await timewarp(10);

    // get latest report
    const report = await readWriteTier.report(signer1.address, []);

    const tierBlock0 = await tierReport.reportTimeForTier(report, Tier.ZERO);
    const tierBlock1 = await tierReport.reportTimeForTier(report, Tier.ONE);
    const tierBlock2 = await tierReport.reportTimeForTier(report, Tier.TWO);
    const tierBlock3 = await tierReport.reportTimeForTier(report, Tier.THREE);

    assert(tierBlock0.isZero(), "did not return block 0");

    assert(
      tierBlock1.eq(expectedTier1Timestamp),
      `wrong tier ONE status block
      report    ${report.toHexString()}
      expected  ${expectedTier1Timestamp}
      got       ${tierBlock1}`
    );

    assert(
      tierBlock2.eq(expectedTier2Block),
      `wrong tier TWO status block
      report    ${report.toHexString()}
      expected  ${expectedTier2Block}
      got       ${tierBlock2}`
    );

    assert(
      ethers.BigNumber.from("0xFFFFFFFF").eq(tierBlock3.toHexString()),
      "reported block for tier THREE despite signer never having tier THREE status"
    );
  });
});
