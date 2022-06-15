import { assert } from "chai";
import { Contract } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import * as Util from "../../../utils";
import {
  getBlockTimestamp,
  op,
  paddedUInt256,
  paddedUInt32,
  tierRange,
  timewarp,
} from "../../../utils";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";

export const Opcode = Util.AllStandardOps;

enum Tier {
  ZERO,
  ONE, // bronze
  TWO, // silver
  THREE, // gold
  FOUR, // platinum
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

describe("EmissionsERC20 Tier Test", async function () {
  it("user explicitly claims, then the user loses the tier and can no longer claim", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const vAlways = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const CURRENT_TIMESTAMP_AS_REPORT = () =>
      concat([
          vAlways,
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
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          op(Opcode.CONSTANT, 0),
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_TIMESTAMP_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
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

    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);
    const tierTimestampFour = await getBlockTimestamp();

    await timewarp(5);

    const timestamp0 = await getBlockTimestamp();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(timestamp0 - tierTimestampFour).repeat(4)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimTimestamp0 = await getBlockTimestamp();

    await readWriteTier.setTier(claimant.address, Tier.THREE, []);

    await timewarp(5);

    const timestamp1 = await getBlockTimestamp();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(5) +
          paddedUInt32(timestamp1 - claimTimestamp0).repeat(3)
      )
    );

    assert(
      claimReport1 === expectedClaimReport1,
      `wrong claim calculation result1
      expected  ${expectedClaimReport1}
      got       ${claimReport1}`
    );
  });

  it("'tier by construction' can be ensured by doing a selectLte against the user's tier, then combining that with the claim report in a second selectLte using every", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const vReadWriteTier = op(Opcode.CONSTANT, 0);
    const vConstructionTime = op(Opcode.CONSTANT, 1);
    const vAlways = op(Opcode.CONSTANT, 2);

    await readWriteTier.setTier(claimant.address, Tier.TWO, []);

    const tierTimestamp = await getBlockTimestamp();

    await timewarp(5);

    // prettier-ignore
    const CURRENT_TIMESTAMP_AS_REPORT = () =>
      concat([
          vAlways,
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
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
        vReadWriteTier,
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_TIMESTAMP_AS_REPORT(),
              TIER_REPORT(),
              vConstructionTime,
            op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 1)),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    const constructionTime = await getBlockTimestamp();

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
          constants: [readWriteTier.address, constructionTime, Util.ALWAYS],
        },
      }
    );

    // should do nothing
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);

    await timewarp(5);

    const timestamp0 = await getBlockTimestamp();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );

    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(6) +
          paddedUInt32(timestamp0 - tierTimestamp).repeat(2)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimTimestamp0 = await getBlockTimestamp();

    // should do nothing
    await readWriteTier.setTier(claimant.address, Tier.SIX, []);

    await timewarp(5);

    const timestamp1 = await getBlockTimestamp();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );

    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(6) +
          paddedUInt32(timestamp1 - claimTimestamp0).repeat(2)
      )
    );

    assert(
      claimReport1 === expectedClaimReport1,
      `wrong claim calculation result1
      expected  ${expectedClaimReport1}
      got       ${claimReport1}`
    );
  });

  it("user has tier at future block, claims at current block for 0 amount, current block reaches future block, user should be able to claim non-zero amount", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const vAlways = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const CURRENT_TIMESTAMP_AS_REPORT = () =>
      concat([
          vAlways,
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
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          op(Opcode.CONSTANT, 0),
          op(Opcode.CONTEXT, 0),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_TIMESTAMP_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_TIMESTAMP),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
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

    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);
    const tierTimestampFour = await getBlockTimestamp();

    await timewarp(5);

    const timestamp0 = await getBlockTimestamp();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(timestamp0 - tierTimestampFour).repeat(4)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimTimestamp0 = await getBlockTimestamp();

    await readWriteTier.setTier(claimant.address, Tier.FIVE, []);
    const tierTimestampFive = await getBlockTimestamp();

    await timewarp(5);

    const timestamp1 = await getBlockTimestamp();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(3) +
          paddedUInt32(timestamp1 - tierTimestampFive) +
          paddedUInt32(timestamp1 - claimTimestamp0).repeat(4)
      )
    );

    assert(
      claimReport1 === expectedClaimReport1,
      `wrong claim calculation result1
      expected  ${expectedClaimReport1}
      got       ${claimReport1}`
    );
  });
});
