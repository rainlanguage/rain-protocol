import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import { ReadWriteTier, TierReportTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basic";
import { Tier } from "../../../utils/types/tier";

describe("TierReport truncateTiersAbove", async function () {
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

  it("should clear (set to 0xFF) all tiers above the given tier in the given report", async () => {
    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.THREE);

    const report = await readWriteTier.report(signer1.address, []);

    const truncatedReport = await tierReport.truncateTiersAbove(
      report,
      Tier.ONE
    );

    const expectedTruncatedReport =
      "0x" + "f".repeat(7 * 8) + report.toHexString().slice(-8);

    assert(
      truncatedReport.eq(expectedTruncatedReport),
      `did not truncate report correctly
      expected  ${expectedTruncatedReport}
      got       ${truncatedReport.toHexString()}`
    );
  });
});
