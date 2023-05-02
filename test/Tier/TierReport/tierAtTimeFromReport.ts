import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { strict as assert } from "assert";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier, TierReportTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import { Tier } from "../../../utils/types/tier";

describe("TierReport tierAtTimeFromReport", async function () {
  let signer1: SignerWithAddress;
  let readWriteTier: ReadWriteTier;
  let tierReport: TierReportTest;

  beforeEach(async () => {
    [, signer1] = await ethers.getSigners();

    readWriteTier = await readWriteTierDeploy();

    tierReport = (await basicDeploy("TierReportTest", {})) as TierReportTest;
  });

  it("should correctly return the highest achieved tier relative to a given report and block number", async () => {
    const initialTimestamp = await getBlockTimestamp();

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.ONE);

    timewarp(10);

    await readWriteTier.connect(signer1).setTier(signer1.address, Tier.TWO);

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
});
