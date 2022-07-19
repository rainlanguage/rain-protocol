import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import * as Util from "../../../utils";
import {
  eighteenZeros,
  getBlockTimestamp,
  op,
  paddedUInt256,
  paddedUInt32,
  sixZeros,
  Tier,
  tierRange,
  timewarp,
} from "../../../utils";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";

const Opcode = Util.AllStandardOps;

describe("EmissionsERC20 Claim Amount Test", async function () {
  it("should calculate claim amount from constant val", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
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

    const claimAmountResult = await emissionsERC20.calculateClaim(
      claimant.address
    );

    assert(
      claimAmountResult.eq(claimAmount),
      `wrong claim amount from constant val
      expected  ${claimAmount}
      got       ${claimAmountResult}`
    );
  });

  it("should perform claim using a constant val as claim amount", async function () {
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
  });

  it("should calculate correct emissions amount (if division is performed on final result)", async function () {
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

    // We're using uints, so we need to scale reward per block up to get out of the decimal places, but a precision of 18 zeros is too much to fit within a uint32 (since we store block rewards per tier in a report-like format). Six zeros should be enough.
    const BN_ONE_REWARD = BigNumber.from("1" + sixZeros);

    // 2 seconds per block
    const BLOCKS_PER_YEAR = 43200 * 365.25;

    const BLOCKS_PER_MONTH = Math.floor(BLOCKS_PER_YEAR / 12);

    const MONTHLY_REWARD_BRNZ = BigNumber.from(100).mul(BN_ONE_REWARD);

    const MONTHLY_REWARD_SILV = BigNumber.from(200)
      .mul(BN_ONE_REWARD)
      .sub(MONTHLY_REWARD_BRNZ);

    const MONTHLY_REWARD_GOLD = BigNumber.from(500)
      .mul(BN_ONE_REWARD)
      .sub(MONTHLY_REWARD_SILV.add(MONTHLY_REWARD_BRNZ));

    const MONTHLY_REWARD_PLAT = BigNumber.from(1000)
      .mul(BN_ONE_REWARD)
      .sub(
        MONTHLY_REWARD_GOLD.add(MONTHLY_REWARD_SILV).add(MONTHLY_REWARD_BRNZ)
      );

    const REWARD_PER_BLOCK_BRNZ = MONTHLY_REWARD_BRNZ.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_SILV = MONTHLY_REWARD_SILV.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_GOLD = MONTHLY_REWARD_GOLD.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_PLAT = MONTHLY_REWARD_PLAT.div(BLOCKS_PER_MONTH);

    const BASE_REWARD_PER_TIER = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(REWARD_PER_BLOCK_PLAT) +
          paddedUInt32(REWARD_PER_BLOCK_GOLD) +
          paddedUInt32(REWARD_PER_BLOCK_SILV) +
          paddedUInt32(REWARD_PER_BLOCK_BRNZ)
      )
    );

    console.log("bronze", REWARD_PER_BLOCK_BRNZ);
    console.log("silver", REWARD_PER_BLOCK_SILV);
    console.log("gold", REWARD_PER_BLOCK_GOLD);
    console.log("platinum", REWARD_PER_BLOCK_PLAT);

    // BEGIN global constants

    const valTierAddrAddress = op(Opcode.CONSTANT, 0);
    const valBaseRewardPerTier = op(Opcode.CONSTANT, 1);
    const valBlocksPerYear = op(Opcode.CONSTANT, 2);
    const valAlways = op(Opcode.CONSTANT, 3);
    const valOne = op(Opcode.CONSTANT, 4);

    // END global constants

    // BEGIN zipmap args

    const argDuration = op(Opcode.CONSTANT, 5);
    const argBaseReward = op(Opcode.CONSTANT, 6);

    // END zipmap args

    // BEGIN Source snippets

    // prettier-ignore
    const PROGRESS = () =>
      concat([
        argDuration,
        valBlocksPerYear,
        op(Opcode.SCALE18_DIV, 0),
        valOne,
        op(Opcode.MIN, 2),
      ]);

    // prettier-ignore
    const MULTIPLIER = () =>
      concat([
        PROGRESS(),
        valOne,
        op(Opcode.ADD, 2),
      ]);

    // prettier-ignore
    const FN = () =>
      concat([
        MULTIPLIER(),
        argBaseReward,
        argDuration,
        op(Opcode.MUL, 3),
      ]);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
        valAlways,
        op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_TIMES_FOR_TIER_RANGE,
          tierRange(Tier.ZERO, Tier.EIGHT)
        ),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
        op(Opcode.THIS_ADDRESS),
        op(Opcode.CONTEXT),
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
        valTierAddrAddress,
        op(Opcode.CONTEXT),
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
        CURRENT_BLOCK_AS_REPORT(),
        op(Opcode.BLOCK_NUMBER),
        TIER_REPORT(),
        LAST_CLAIM_REPORT(),
        op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    // prettier-ignore
    const SOURCE = () =>
      concat([
        TIERWISE_DIFF(),
        valBaseRewardPerTier,
        op(Opcode.ZIPMAP, Util.zipmapSize(1, 3, 1)),
        op(Opcode.ADD, 8),
        // base reward is 6 decimals so we scale back down to 18.
        // we do this outside the zipmap loop to save gas.
        op(Opcode.SCALE18, 24),
      ]);

    // END Source snippets

    const constants = [
      // FN(),
      readWriteTier.address,
      BASE_REWARD_PER_TIER,
      BLOCKS_PER_YEAR,
      Util.ALWAYS,
      Util.ONE,
    ];

    console.log("source", SOURCE(), FN());
    console.log("constants", constants);
    console.log("source length", SOURCE().length);

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
          sources: [SOURCE(), FN()],
          constants,
        },
      }
    );

    // const immutableSource = await emissionsERC20.source();

    // Has Platinum Tier
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);

    const tierTimestamp = await getBlockTimestamp();

    const expectedClaimDuration = 123;

    await timewarp(expectedClaimDuration);

    const claimTimestamp = await getBlockTimestamp();

    // 123
    const claimDuration = claimTimestamp - tierTimestamp;

    // 123000000000000000000
    const claimDurationBN = BigNumber.from(claimDuration + eighteenZeros);

    // 7795269602251
    const fractionalClaimDurationBN = claimDurationBN.div(BLOCKS_PER_YEAR);

    // account for saturation, no extra bonus beyond 1 year
    // 7795269602251
    const fractionalClaimDurationRemoveExcessBN = fractionalClaimDurationBN.lt(
      Util.ONE
    )
      ? fractionalClaimDurationBN
      : Util.ONE;

    // 1501369863013698630
    const fractionalClaimDurationRemoveExcessAddOneBN =
      fractionalClaimDurationRemoveExcessBN.add(Util.ONE);

    // 9348
    const baseRewardByDurationBronze = REWARD_PER_BLOCK_BRNZ.mul(claimDuration);

    // 9348
    const baseRewardByDurationSilver = REWARD_PER_BLOCK_SILV.mul(claimDuration);

    // 28044
    const baseRewardByDurationGold = REWARD_PER_BLOCK_GOLD.mul(claimDuration);

    // 46740
    const baseRewardByDurationPlatinum =
      REWARD_PER_BLOCK_PLAT.mul(claimDuration);

    // 93480
    const sumBaseRewardByDuration = baseRewardByDurationPlatinum
      .add(baseRewardByDurationGold)
      .add(baseRewardByDurationSilver)
      .add(baseRewardByDurationBronze);

    // 93480728701802418
    const expectedClaimAmount = fractionalClaimDurationRemoveExcessAddOneBN
      .mul(sumBaseRewardByDuration)
      .div(BN_ONE_REWARD);

    const claimAmount = await emissionsERC20.calculateClaim(claimant.address);

    console.log(`expectations:
    claimDuration                               ${claimDuration}
    claimDurationBN                             ${claimDurationBN}
    fractionalClaimDurationBN                   ${fractionalClaimDurationBN}
    baseRewardByDurationBronze                  ${baseRewardByDurationBronze}
    baseRewardByDurationSilver                  ${baseRewardByDurationSilver}
    baseRewardByDurationGold                    ${baseRewardByDurationGold}
    baseRewardByDurationPlatinum                ${baseRewardByDurationPlatinum}
    sumBaseRewardByDuration                     ${sumBaseRewardByDuration}
    fractionalClaimDurationRemoveExcessAddOneBN ${fractionalClaimDurationRemoveExcessAddOneBN}
    expectedClaimAmount                         ${expectedClaimAmount}
    claimAmount                                 ${claimAmount}
    `);

    console.log(claimAmount, expectedClaimAmount);

    await emissionsERC20.connect(claimant).claim(claimant.address, []);

    console.log(await emissionsERC20.balanceOf(claimant.address));
  });

  it("should calculate correct emissions amount (if division is performed on each result per tier)", async function () {
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

    const BN_ONE = BigNumber.from("1" + eighteenZeros);

    // We're using uints, so we need to scale reward per block up to get out of the decimal places, but a precision of 18 zeros is too much to fit within a uint32 (since we store block rewards per tier in a report-like format). Six zeros should be enough.
    const BN_ONE_REWARD = BigNumber.from("1" + sixZeros);

    // 2 seconds per block
    const BLOCKS_PER_YEAR = 43200 * 365.25;

    const BLOCKS_PER_MONTH = Math.floor(BLOCKS_PER_YEAR / 12);

    const MONTHLY_REWARD_BRNZ = BigNumber.from(100).mul(BN_ONE_REWARD);

    const MONTHLY_REWARD_SILV = BigNumber.from(200)
      .mul(BN_ONE_REWARD)
      .sub(MONTHLY_REWARD_BRNZ);

    const MONTHLY_REWARD_GOLD = BigNumber.from(500)
      .mul(BN_ONE_REWARD)
      .sub(MONTHLY_REWARD_SILV.add(MONTHLY_REWARD_BRNZ));

    const MONTHLY_REWARD_PLAT = BigNumber.from(1000)
      .mul(BN_ONE_REWARD)
      .sub(
        MONTHLY_REWARD_GOLD.add(MONTHLY_REWARD_SILV).add(MONTHLY_REWARD_BRNZ)
      );

    const REWARD_PER_BLOCK_BRNZ = MONTHLY_REWARD_BRNZ.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_SILV = MONTHLY_REWARD_SILV.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_GOLD = MONTHLY_REWARD_GOLD.div(BLOCKS_PER_MONTH);
    const REWARD_PER_BLOCK_PLAT = MONTHLY_REWARD_PLAT.div(BLOCKS_PER_MONTH);

    const BASE_REWARD_PER_TIER = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(REWARD_PER_BLOCK_PLAT) +
          paddedUInt32(REWARD_PER_BLOCK_GOLD) +
          paddedUInt32(REWARD_PER_BLOCK_SILV) +
          paddedUInt32(REWARD_PER_BLOCK_BRNZ)
      )
    );

    // BEGIN global constants

    const valTierAddrAddress = op(Opcode.CONSTANT, 0);
    const valBaseRewardPerTier = op(Opcode.CONSTANT, 1);
    const valBlocksPerYear = op(Opcode.CONSTANT, 2);
    const valBNOne = op(Opcode.CONSTANT, 3);
    const valBNOneReward = op(Opcode.CONSTANT, 4);
    const valAlways = op(Opcode.CONSTANT, 5);

    // END global constants

    // BEGIN zipmap args

    const valDuration = op(Opcode.CONSTANT, 6);
    const valBaseReward = op(Opcode.CONSTANT, 7);

    // END zipmap args

    // BEGIN Source snippets

    // prettier-ignore
    const REWARD = () =>
      concat([
        valDuration,
        valBaseReward,
        op(Opcode.MUL, 2),
      ]);

    // prettier-ignore
    const PROGRESS = () =>
      concat([
        valBNOne,
        valDuration,
        valBNOne,
        op(Opcode.MUL, 2),
        valBlocksPerYear,
        op(Opcode.DIV, 2),
        op(Opcode.MIN, 2),
      ]);

    // prettier-ignore
    const MULTIPLIER = () =>
      concat([
        PROGRESS(),
        valBNOne,
        op(Opcode.ADD, 2),
      ]);

    // prettier-ignore
    const FN = () =>
      concat([
        REWARD(),
        MULTIPLIER(),
        op(Opcode.MUL, 2),
        valBNOneReward, // scale EACH tier result down by reward per block scaler
        op(Opcode.DIV, 2),
      ]);

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
        op(Opcode.CONTEXT),
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
        valTierAddrAddress,
        op(Opcode.CONTEXT),
        op(Opcode.ITIERV2_REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
        CURRENT_TIMESTAMP_AS_REPORT(),
        op(Opcode.BLOCK_TIMESTAMP),
        TIER_REPORT(),
        LAST_CLAIM_REPORT(),
        op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    // prettier-ignore
    const SOURCE = () =>
      concat([
        TIERWISE_DIFF(),
        valBaseRewardPerTier,
        op(Opcode.ZIPMAP, Util.zipmapSize(1, 3, 1)),
        op(Opcode.ADD, 8),
      ]);

    // END Source snippets

    const constants = [
      readWriteTier.address,
      BASE_REWARD_PER_TIER,
      BLOCKS_PER_YEAR,
      BN_ONE,
      BN_ONE_REWARD,
      Util.ALWAYS,
    ];

    console.log("source", SOURCE());
    console.log("constants", constants);
    console.log("source length", SOURCE().length);

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
          sources: [SOURCE(), FN()],
          constants,
        },
      }
    );

    // Has Platinum Tier
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);

    const tierTimestamp = await getBlockTimestamp();

    const expectedClaimDuration = 123;

    await timewarp(expectedClaimDuration);

    const claimTimestamp = await getBlockTimestamp();

    // 123
    const claimDuration = claimTimestamp - tierTimestamp;

    // 123000000000000000000
    const claimDurationBN = BigNumber.from(claimDuration + eighteenZeros);

    // 7795269602251
    const fractionalClaimDurationBN = claimDurationBN.div(BLOCKS_PER_YEAR);

    // account for saturation, no extra bonus beyond 1 year
    // 7795269602251
    const fractionalClaimDurationRemoveExcessBN = fractionalClaimDurationBN.lt(
      BN_ONE
    )
      ? fractionalClaimDurationBN
      : BN_ONE;

    // 1501369863013698630
    const fractionalClaimDurationRemoveExcessAddOneBN =
      fractionalClaimDurationRemoveExcessBN.add(BN_ONE);

    // 9348
    const baseRewardByDurationBronze = REWARD_PER_BLOCK_BRNZ.mul(claimDuration);

    // 9348
    const baseRewardByDurationSilver = REWARD_PER_BLOCK_SILV.mul(claimDuration);

    // 28044
    const baseRewardByDurationGold = REWARD_PER_BLOCK_GOLD.mul(claimDuration);

    // 46740
    const baseRewardByDurationPlatinum =
      REWARD_PER_BLOCK_PLAT.mul(claimDuration);

    // 93480
    const sumBaseRewardByDuration = baseRewardByDurationPlatinum
      .add(baseRewardByDurationGold)
      .add(baseRewardByDurationSilver)
      .add(baseRewardByDurationBronze);

    const expectedClaimAmountPlat = fractionalClaimDurationRemoveExcessAddOneBN
      .mul(baseRewardByDurationPlatinum)
      .div(BN_ONE_REWARD);
    const expectedClaimAmountGold = fractionalClaimDurationRemoveExcessAddOneBN
      .mul(baseRewardByDurationGold)
      .div(BN_ONE_REWARD);
    const expectedClaimAmountSilv = fractionalClaimDurationRemoveExcessAddOneBN
      .mul(baseRewardByDurationSilver)
      .div(BN_ONE_REWARD);
    const expectedClaimAmountBrnz = fractionalClaimDurationRemoveExcessAddOneBN
      .mul(baseRewardByDurationBronze)
      .div(BN_ONE_REWARD);

    // 93480728701802416
    const expectedClaimAmount = expectedClaimAmountPlat
      .add(expectedClaimAmountGold)
      .add(expectedClaimAmountSilv)
      .add(expectedClaimAmountBrnz);

    const claimAmount = await emissionsERC20.calculateClaim(claimant.address);

    console.log(`expectations:
    claimDuration                               ${claimDuration}
    claimDurationBN                             ${claimDurationBN}
    fractionalClaimDurationBN                   ${fractionalClaimDurationBN}
    baseRewardByDurationBronze                  ${baseRewardByDurationBronze}
    baseRewardByDurationSilver                  ${baseRewardByDurationSilver}
    baseRewardByDurationGold                    ${baseRewardByDurationGold}
    baseRewardByDurationPlatinum                ${baseRewardByDurationPlatinum}
    sumBaseRewardByDuration                     ${sumBaseRewardByDuration}
    fractionalClaimDurationRemoveExcessAddOneBN ${fractionalClaimDurationRemoveExcessAddOneBN}
    expectedClaimAmount                         ${expectedClaimAmount}
    claimAmount                                 ${claimAmount}
    `);

    assert(
      claimAmount.eq(expectedClaimAmount),
      `wrong claim calculation result
      expected  ${expectedClaimAmount}
      got       ${claimAmount}`
    );
  });
});
