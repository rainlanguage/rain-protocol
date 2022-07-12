import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import * as Util from "../../../utils";
import {
  compareTierReports,
  getBlockTimestamp,
  op,
  paddedUInt256,
  paddedUInt32,
  Tier,
  tierRange,
  timewarp,
} from "../../../utils";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";

const Opcode = Util.AllStandardOps;

describe("EmissionsERC20 Report Test", async function () {
  it("should record the latest claim timestamp for each slot in a tier report", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [concat([op(Opcode.CONSTANT)])],
          constants: [claimAmount],
        },
      }
    );

    await emissionsERC20
      .connect(claimant)
      .claim(
        claimant.address,
        hexlify([...Buffer.from("Custom claim message")])
      );
    const claimTimestamp = await getBlockTimestamp();

    const expectedReport = paddedUInt256(
      ethers.BigNumber.from("0x" + paddedUInt32(claimTimestamp).repeat(8))
    );

    const actualReport = paddedUInt256(
      await emissionsERC20.report(claimant.address, [])
    );

    compareTierReports(expectedReport, actualReport);
  });

  it("should diff reports correctly", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const constants = [readWriteTier.address, Util.NEVER];
    const valTierAddr = op(Opcode.CONSTANT, 0);
    const valNever = op(Opcode.CONSTANT, 1);

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [
            // prettier-ignore
            concat([
              valNever,
              op(Opcode.BLOCK_TIMESTAMP),
              op(
                Opcode.UPDATE_TIMES_FOR_TIER_RANGE,
                tierRange(Tier.ZERO, Tier.EIGHT)
              ),
              valTierAddr,
              op(Opcode.CONTEXT),
              op(Opcode.ITIERV2_REPORT),
              op(Opcode.SATURATING_DIFF),
            ]),
          ],
          constants,
        },
      }
    );

    await readWriteTier.setTier(claimant.address, Tier.EIGHT, []);
    const setTierTimestamp = await getBlockTimestamp();

    await timewarp(5);

    const diffResult = await emissionsERC20.calculateClaim(claimant.address);
    const calculationTimestamp = await getBlockTimestamp();

    const expectedDiff = paddedUInt256(
      ethers.BigNumber.from(
        "0x" + paddedUInt32(calculationTimestamp - setTierTimestamp).repeat(8)
      )
    );

    assert(!diffResult.isZero(), "diff result was zero");
    assert(
      diffResult.eq(expectedDiff),
      `wrong diff result
      expected  ${hexlify(expectedDiff)}
      got       ${hexlify(diffResult)}`
    );
  });

  it("should return default claim report for an account before claiming", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [
            concat([
              // lastClaimReport
              op(Opcode.THIS_ADDRESS),
              op(Opcode.CONTEXT),
              op(Opcode.ITIERV2_REPORT),
            ]),
          ],
          constants: [],
        },
      }
    );

    const beforeClaimReport = await emissionsERC20.calculateClaim(
      claimant.address
    );

    assert(
      beforeClaimReport.eq(0),
      `wrong emissions report before claim
      expected  ${0}
      got       ${hexlify(beforeClaimReport)}`
    );
  });

  it("should calculate claim report as difference between current block timestamp and everyLteMax([tierReport, lastClaimReport]) for each tier", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const valTierAddr = op(Opcode.CONSTANT, 0);
    const valAlways = op(Opcode.CONSTANT, 1);

    const ctxClaimant = op(Opcode.CONTEXT, 0);

    // prettier-ignore
    const CURRENT_TIMESTAMP_AS_REPORT = () =>
      concat([
          valAlways,
          op(Opcode.BLOCK_TIMESTAMP),
        op(
          Opcode.UPDATE_TIMES_FOR_TIER_RANGE,
          tierRange(Tier.ZERO, Tier.EIGHT)
        ),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
          op(Opcode.THIS_ADDRESS),
          ctxClaimant,
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          valTierAddr,
          ctxClaimant,
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_TIMESTAMP_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.SELECT_LTE, Util.selectLte(
            Util.selectLteLogic.every,
            Util.selectLteMode.max,
            2
          )),
        op(Opcode.SATURATING_DIFF),
      ]);

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [TIERWISE_DIFF()],
          constants: [readWriteTier.address, Util.ALWAYS],
        },
      }
    );

    await readWriteTier.setTier(claimant.address, Tier.ONE, []);
    const tierTimestampOne = await getBlockTimestamp();
    await readWriteTier.setTier(claimant.address, Tier.TWO, []);
    const tierTimestampTwo = await getBlockTimestamp();
    await readWriteTier.setTier(claimant.address, Tier.THREE, []);
    const tierTimestampThree = await getBlockTimestamp();
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);
    const tierTimestampFour = await getBlockTimestamp();

    await timewarp(5);

    const timestamp0 = await getBlockTimestamp();

    const claimReport = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(timestamp0 - tierTimestampFour) +
          paddedUInt32(timestamp0 - tierTimestampThree) +
          paddedUInt32(timestamp0 - tierTimestampTwo) +
          paddedUInt32(timestamp0 - tierTimestampOne)
      )
    );

    assert(
      claimReport === expectedClaimReport,
      `wrong claim calculation result
      expected  ${expectedClaimReport}
      got       ${claimReport}`
    );
  });
});
