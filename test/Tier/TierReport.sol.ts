import { assert } from "chai";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TierReportTest } from "../../typechain/TierReportTest";
import type { ReserveTokenTest } from "../../typechain/ReserveTokenTest";
import {
  assertError,
  basicDeploy,
  getBlockTimestamp,
  timewarp,
  zeroPad32,
  zeroPad4,
} from "../../utils";
import type { Contract } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { hexlify } from "ethers/lib/utils";

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

describe("TierReport", async function () {
  let signer1: SignerWithAddress;
  let readWriteTier: ReadWriteTier & Contract;
  let reserve: ReserveTokenTest & Contract;
  let tierReport: TierReportTest & Contract;

  beforeEach(async () => {
    [, signer1] = await ethers.getSigners();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    tierReport = (await basicDeploy("TierReportTest", {})) as TierReportTest &
      Contract;

    reserve = (await basicDeploy("ReserveTokenTest", {})) as ReserveTokenTest &
      Contract;
  });

  it("should enforce maxTier for all TierReport logic", async () => {
    const initialBlock = await ethers.provider.getBlockNumber();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE, []);

    while ((await ethers.provider.getBlockNumber()) < initialBlock + 10) {
      reserve.transfer(signer1.address, 0); // create empty block
    }

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    while ((await ethers.provider.getBlockNumber()) < initialBlock + 20) {
      reserve.transfer(signer1.address, 0); // create empty block
    }

    const report = await readWriteTier.report(signer1.address, []);

    // tierBlock()
    await assertError(
      async () => await tierReport.tierTime(report, 9),
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

  it("should correctly return the highest achieved tier relative to a given report and block number", async () => {
    const initialTimestamp = await getBlockTimestamp();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE, []);

    timewarp(10);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    timewarp(10);

    const report = await readWriteTier.report(signer1.address, []);

    const tierBlockReport1 = await tierReport.tierAtTimeFromReport(
      report,
      initialTimestamp + 5
    );

    const tierBlockReport2 = await tierReport.tierAtTimeFromReport(
      report,
      initialTimestamp + 15
    );

    assert(
      tierBlockReport1.eq(Tier.ONE),
      `wrong tier from report
      expected  ${Tier.ONE}
      got       ${tierBlockReport1}
      report    ${hexlify(report)}`
    );
    assert(
      tierBlockReport2.eq(Tier.TWO),
      `wrong tier from report
      expected  ${Tier.TWO}
      got       ${tierBlockReport2}
      report    ${hexlify(report)}`
    );
  });

  it("should return the block for a specified status according to a given report", async () => {
    const initialBlock = await ethers.provider.getBlockNumber();

    // set status ONE
    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE, []);
    const expectedTier1Block = await ethers.provider.getBlockNumber();

    // make empty blocks
    while ((await ethers.provider.getBlockNumber()) < initialBlock + 10) {
      reserve.transfer(signer1.address, 0); // create empty block
    }

    // set status TWO
    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);
    const expectedTier2Block = await ethers.provider.getBlockNumber();

    // make empty blocks
    while ((await ethers.provider.getBlockNumber()) < initialBlock + 20) {
      reserve.transfer(signer1.address, 0); // create empty block
    }

    // get latest report
    const report = await readWriteTier.report(signer1.address, []);

    const tierBlock0 = await tierReport.tierTime(report, Tier.ZERO);
    const tierBlock1 = await tierReport.tierTime(report, Tier.ONE);
    const tierBlock2 = await tierReport.tierTime(report, Tier.TWO);
    const tierBlock3 = await tierReport.tierTime(report, Tier.THREE);

    assert(tierBlock0.isZero(), "did not return block 0");

    assert(
      tierBlock1.eq(expectedTier1Block),
      `wrong tier ONE status block
    report    ${report.toHexString()}
    expected  ${expectedTier1Block}
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

  it("should clear (set to 0xFF) all tiers above the given tier in the given report", async () => {
    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.THREE, []);

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

  it("should set all tiers within a min/max tier range to the specified block number in a given report", async () => {
    const initialBlock = await ethers.provider.getBlockNumber();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    const report = await readWriteTier.report(signer1.address, []);

    const targetBlock = initialBlock + 1000;

    const updatedReportBadRange = await tierReport.updateTimesForTierRange(
      report,
      Tier.SEVEN,
      Tier.SIX,
      targetBlock
    );

    // bad range should return original report
    assert(updatedReportBadRange.eq(report), "changed report with bad range");

    const updatedReport = await tierReport.updateTimesForTierRange(
      report,
      Tier.SIX, // smaller number first
      Tier.SEVEN,
      targetBlock
    );

    const initialBlockHex = ethers.BigNumber.from(targetBlock)
      .toHexString()
      .slice(2);

    const initialBlockHexFormatted =
      "0".repeat(8 - initialBlockHex.length) + initialBlockHex;

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

  it("should correctly set new blocks based on whether the new tier is higher or lower than the current one", async () => {
    const initialTimestamp = await getBlockTimestamp();
    const initialTimestampHex = zeroPad4(
      ethers.BigNumber.from(initialTimestamp)
    ).slice(2);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE, []);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO, []);

    await timewarp(1);

    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.THREE, []);

    await timewarp(1);

    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.FOUR, []);

    await timewarp(1);

    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.FIVE, []);

    await timewarp(1);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.SIX, []);

    await timewarp(1);

    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.SEVEN, []);

    await timewarp(1);

    await readWriteTier
      .connect(signer1)
      .setTier(signer1.address, Tier.EIGHT, []);

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
