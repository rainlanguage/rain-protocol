import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import * as claimUtil from "./ClaimUtil";
import { concat, hexlify } from "ethers/lib/utils";
import {
  eighteenZeros,
  op,
  paddedUInt32,
  paddedUInt256,
  sixZeros,
} from "../Util";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { BigNumber, Contract } from "ethers";

const { assert } = chai;

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

describe("EmissionsERC20", async function () {
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

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const vReadWriteTier = op(Opcode.CONSTANT, 0);
    const vConstructionBlock = op(Opcode.CONSTANT, 1);
    const vAlways = op(Opcode.CONSTANT, 2);

    await readWriteTier.setTier(claimant.address, Tier.TWO, []);

    const tierBlock = await ethers.provider.getBlockNumber();

    await Util.createEmptyBlock(5);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
          vAlways,
          op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
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
          CURRENT_BLOCK_AS_REPORT(),
              TIER_REPORT(),
              vConstructionBlock,
            op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 1)),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    const constructionBlock = await ethers.provider.getBlockNumber();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
          constants: [readWriteTier.address, constructionBlock, Util.ALWAYS],
        },
      }
    );

    // should do nothing
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );

    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(6) +
          paddedUInt32(block0 - tierBlock).repeat(2)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimBlock0 = await ethers.provider.getBlockNumber();

    // should do nothing
    await readWriteTier.setTier(claimant.address, Tier.SIX, []);

    await Util.createEmptyBlock(5);

    const block1 = await ethers.provider.getBlockNumber();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );

    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(6) +
          paddedUInt32(block1 - claimBlock0).repeat(2)
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

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const vAlways = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
          vAlways,
          op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
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
          CURRENT_BLOCK_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
    const tierBlockFour = await ethers.provider.getBlockNumber();

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(block0 - tierBlockFour).repeat(4)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimBlock0 = await ethers.provider.getBlockNumber();

    await readWriteTier.setTier(claimant.address, Tier.FIVE, []);
    const tierBlockFive = await ethers.provider.getBlockNumber();

    await Util.createEmptyBlock(5);

    const block1 = await ethers.provider.getBlockNumber();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(3) +
          paddedUInt32(block1 - tierBlockFive) +
          paddedUInt32(block1 - claimBlock0).repeat(4)
      )
    );

    assert(
      claimReport1 === expectedClaimReport1,
      `wrong claim calculation result1
      expected  ${expectedClaimReport1}
      got       ${claimReport1}`
    );
  });

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

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const vAlways = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
          vAlways,
          op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
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
          CURRENT_BLOCK_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
    const tierBlockFour = await ethers.provider.getBlockNumber();

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();

    const claimReport0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport0 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(block0 - tierBlockFour).repeat(4)
      )
    );

    assert(
      claimReport0 === expectedClaimReport0,
      `wrong claim calculation result0
      expected  ${expectedClaimReport0}
      got       ${claimReport0}`
    );

    await emissionsERC20.connect(claimant).claim(claimant.address, []);
    const claimBlock0 = await ethers.provider.getBlockNumber();

    await readWriteTier.setTier(claimant.address, Tier.THREE, []);

    await Util.createEmptyBlock(5);

    const block1 = await ethers.provider.getBlockNumber();

    const claimReport1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(5) +
          paddedUInt32(block1 - claimBlock0).repeat(3)
      )
    );

    assert(
      claimReport1 === expectedClaimReport1,
      `wrong claim calculation result1
      expected  ${expectedClaimReport1}
      got       ${claimReport1}`
    );
  });

  it("should calculate correct emissions amount (if division is performed on final result)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

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

    const valTierAddress = op(Opcode.CONSTANT, 0);
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
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
        ),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
          op(Opcode.THIS_ADDRESS),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          valTierAddress,
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_BLOCK_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    // prettier-ignore
    const SOURCE = () =>
      concat([
            TIERWISE_DIFF(),
            valBaseRewardPerTier,
          op(Opcode.ZIPMAP, Util.callSize(1, 3, 1)),
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

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

    const tierBlock = await ethers.provider.getBlockNumber();

    const expectedClaimDuration = 123;

    await Util.createEmptyBlock(expectedClaimDuration); // ~0.001%
    const claimBlock = await ethers.provider.getBlockNumber();

    // 123
    const claimDuration = claimBlock - tierBlock;

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

    // assert(
    //   claimAmount.eq(expectedClaimAmount),
    //   `wrong claim calculation result
    //   expected  ${expectedClaimAmount}
    //   got       ${claimAmount}`
    // );
    console.log(claimAmount, expectedClaimAmount);

    await emissionsERC20.connect(claimant).claim(claimant.address, []);

    console.log(await emissionsERC20.balanceOf(claimant.address));
  });

  it("should calculate correct emissions amount (if division is performed on each result per tier)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

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

    const valTierAddress = op(Opcode.CONSTANT, 0);
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
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
          valAlways,
          op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
        ),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
          op(Opcode.THIS_ADDRESS),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          valTierAddress,
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_BLOCK_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.any, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    // prettier-ignore
    const SOURCE = () =>
      concat([
            TIERWISE_DIFF(),
            valBaseRewardPerTier,
          op(Opcode.ZIPMAP, Util.callSize(1, 3, 1)),
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

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

    const tierBlock = await ethers.provider.getBlockNumber();

    const expectedClaimDuration = 123;

    await Util.createEmptyBlock(expectedClaimDuration); // ~0.001%
    const claimBlock = await ethers.provider.getBlockNumber();

    // 123
    const claimDuration = claimBlock - tierBlock;

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

  it("should return default claim report for an account before claiming", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
              op(Opcode.REPORT),
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

  it("should calculate claim report as difference between current block number and everyLteMax([tierReport, lastClaimReport]) for each tier", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const valAlways = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
          valAlways,
          op(Opcode.BLOCK_NUMBER),
        op(
          Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
        ),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
          op(Opcode.THIS_ADDRESS),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
          op(Opcode.CONSTANT, 0),
          op(Opcode.CONTEXT),
        op(Opcode.REPORT),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
          CURRENT_BLOCK_AS_REPORT(),
            TIER_REPORT(),
            LAST_CLAIM_REPORT(),
            op(Opcode.BLOCK_NUMBER),
          op(Opcode.SELECT_LTE, Util.selectLte(Util.selectLteLogic.every, Util.selectLteMode.max, 2)),
        op(Opcode.SATURATING_DIFF),
      ]);

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
    const tierBlockOne = await ethers.provider.getBlockNumber();
    await readWriteTier.setTier(claimant.address, Tier.TWO, []);
    const tierBlockTwo = await ethers.provider.getBlockNumber();
    await readWriteTier.setTier(claimant.address, Tier.THREE, []);
    const tierBlockThree = await ethers.provider.getBlockNumber();
    await readWriteTier.setTier(claimant.address, Tier.FOUR, []);
    const tierBlockFour = await ethers.provider.getBlockNumber();

    await Util.createEmptyBlock(5);

    const block0 = await ethers.provider.getBlockNumber();

    const claimReport = paddedUInt256(
      await emissionsERC20.calculateClaim(claimant.address)
    );
    const expectedClaimReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(block0 - tierBlockFour) +
          paddedUInt32(block0 - tierBlockThree) +
          paddedUInt32(block0 - tierBlockTwo) +
          paddedUInt32(block0 - tierBlockOne)
      )
    );

    assert(
      claimReport === expectedClaimReport,
      `wrong claim calculation result
      expected  ${expectedClaimReport}
      got       ${claimReport}`
    );
  });

  it("should diff reports correctly", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const valNever = op(Opcode.CONSTANT, 1);

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
              valNever,
              op(Opcode.BLOCK_NUMBER),
              op(
                Opcode.UPDATE_BLOCKS_FOR_TIER_RANGE,
                claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
              ),
              op(Opcode.CONSTANT, 0),
              op(Opcode.CONTEXT),
              op(Opcode.REPORT),
              op(Opcode.SATURATING_DIFF),
            ]),
          ],
          constants: [readWriteTier.address, Util.NEVER],
        },
      }
    );

    const setTierBlock = (await ethers.provider.getBlockNumber()) + 1;
    await readWriteTier.setTier(claimant.address, Tier.EIGHT, []);

    await Util.createEmptyBlock(5);

    const calculationBlock = await ethers.provider.getBlockNumber();
    const diffResult = await emissionsERC20.calculateClaim(claimant.address);

    const expectedDiff = paddedUInt256(
      ethers.BigNumber.from(
        "0x" + paddedUInt32(calculationBlock - setTierBlock).repeat(8)
      )
    );

    assert(
      diffResult.eq(expectedDiff),
      `wrong diff result
      expected  ${hexlify(expectedDiff)}
      got       ${hexlify(diffResult)}`
    );
  });

  it("should record the latest claim block as a tier report", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

    const claimBlockNumber = (await ethers.provider.getBlockNumber()) + 1;

    await emissionsERC20
      .connect(claimant)
      .claim(
        claimant.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const expectedReport = paddedUInt256(
      ethers.BigNumber.from("0x" + paddedUInt32(claimBlockNumber).repeat(8))
    );

    const actualReport = paddedUInt256(
      await emissionsERC20.report(claimant.address)
    );

    assert(
      actualReport === expectedReport,
      `wrong emissions claim report
      expected  ${expectedReport}
      actual    ${actualReport}`
    );
  });

  it("should allow delegated claims when flag set to true", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];
    const delegate = signers[2];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

    await emissionsERC20
      .connect(delegate)
      .claim(
        claimant.address,
        hexlify([...Buffer.from("Custom claim message")])
      );
  });

  it("should prevent delegated claims when flag set to false", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];
    const delegate = signers[2];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

    assert(!(await emissionsERC20.allowDelegatedClaims()));

    await Util.assertError(
      async () =>
        await emissionsERC20
          .connect(delegate)
          .claim(
            claimant.address,
            hexlify([...Buffer.from("Custom claim message")])
          ),
      "DELEGATED_CLAIM",
      "did not prevent delegated claim when flag was set to false"
    );
  });

  it("should perform claim using a constant val as claim amount", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

  it("should calculate claim amount from constant val", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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

  it("should hold important correct values on construction", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
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
          constants: [0],
        },
      }
    );

    assert(await emissionsERC20.allowDelegatedClaims());
  });
});
