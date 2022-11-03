import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import { ReadWriteTier, TierReportTest } from "../../../typechain";
import { zeroPad32, zeroPad4 } from "../../../utils/bytes";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import { Tier } from "../../../utils/types/tier";

describe("TierReport updateReportWithTierAtTime", async function () {
  let signer1: SignerWithAddress;
  let readWriteTier: ReadWriteTier;
  let tierReport: TierReportTest;

  beforeEach(async () => {
    [, signer1] = await ethers.getSigners();

    readWriteTier = await readWriteTierDeploy();

    tierReport = (await basicDeploy("TierReportTest", {})) as TierReportTest;
  });

  it("should correctly set new blocks based on whether the new tier is higher or lower than the current one", async () => {
    const initialTimestamp = await getBlockTimestamp();
    const initialTimestampHex = zeroPad4(
      ethers.BigNumber.from(initialTimestamp)
    ).slice(2);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.THREE);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.FOUR);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.FIVE);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.SIX);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.SEVEN);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.EIGHT);

    await timewarp(1);

    const reportUnpadded = await readWriteTier.report(signer1.address, []);
    const report = zeroPad32(reportUnpadded);

    const updatedReportTruncated = await tierReport.updateReportWithTierAtTime(
      report,
      Tier.EIGHT,
      Tier.FOUR,
      await getBlockTimestamp()
    );

    const updatedReportTruncatedLeftHalf = updatedReportTruncated
      .toHexString()
      .slice(2, 34);

    for (let i = 0; i < updatedReportTruncatedLeftHalf.length; i++) {
      assert(
        updatedReportTruncatedLeftHalf.charAt(i) === "f",
        `hex character wasn't truncated at position ${i}`
      );
    }

    // set tier FIVE timestamp to initialTimestamp
    const updatedReportSetTimestamp =
      await tierReport.updateReportWithTierAtTime(
        report,
        Tier.FOUR,
        Tier.FIVE,
        initialTimestamp
      );

    const actualFirstSection = zeroPad32(updatedReportSetTimestamp).slice(
      2,
      26
    );
    const expectedFirstSection = report.slice(2, 26);

    assert(
      actualFirstSection === expectedFirstSection,
      `first section of updated report (set timestamp) is wrong
      expected  ${expectedFirstSection}
      got       ${actualFirstSection}`
    );

    const actualSetTimestamp = updatedReportSetTimestamp
      .toHexString()
      .slice(-40)
      .slice(0, 8);
    const expectedSetTimestamp =
      "0".repeat(8 - initialTimestampHex.length) + initialTimestampHex;
    assert(
      actualSetTimestamp === expectedSetTimestamp,
      `set timestamp was wrong
      expected  ${expectedSetTimestamp}
      got       ${actualSetTimestamp}`
    );

    const actualLastSection = zeroPad32(updatedReportSetTimestamp).slice(
      26 + 8
    );
    const expectedLastSection = report.slice(26 + 8);

    assert(
      actualLastSection === expectedLastSection,
      `last section of updated report (set timestamp) is wrong
      expected  ${expectedLastSection}
      got       ${actualLastSection}`
    );
  });
});
