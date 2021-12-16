import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import * as claimUtil from "./ClaimUtil";
import { concat, hexlify } from "ethers/lib/utils";
import {
  chunkedSource,
  eighteenZeros,
  op,
  paddedUInt32,
  paddedUInt256,
  arg,
  sixZeros,
} from "../Util";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { BigNumber, Contract } from "ethers";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

const enum Opcode {
  noop,
  val,
  zipmap,
  blockNumber,
  thisAddress,
  add,
  sub,
  mul,
  pow,
  div,
  mod,
  min,
  max,
  average,
  report,
  never,
  always,
  diff,
  updateBlocksForTierRange,
  everyLteMin,
  everyLteMax,
  everyLteFirst,
  anyLteMin,
  anyLteMax,
  anyLteFirst,
  account,
  constructionBlockNumber,
}

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
  it("should calculate correct emissions amount", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const BONE = BigNumber.from("1" + eighteenZeros);

    // We're using uints, so we need to scale reward per block up to get out of the decimal places, but a precision of 18 zeros is too much to fit within a uint32 (since we store block rewards per tier in a report-like format). Six zeros should be enough.
    const BONE_REWARD = BigNumber.from("1" + sixZeros);

    // 2 seconds per block
    const BLOCKS_PER_YEAR = 43200 * 365.25;

    const BLOCKS_PER_MONTH = Math.floor(BLOCKS_PER_YEAR / 12);

    const MONTHLY_REWARD_BRNZ = BigNumber.from(100).mul(BONE_REWARD);

    const MONTHLY_REWARD_SILV = BigNumber.from(200)
      .mul(BONE_REWARD)
      .sub(MONTHLY_REWARD_BRNZ);

    const MONTHLY_REWARD_GOLD = BigNumber.from(500)
      .mul(BONE_REWARD)
      .sub(MONTHLY_REWARD_SILV.add(MONTHLY_REWARD_BRNZ));

    const MONTHLY_REWARD_PLAT = BigNumber.from(1000)
      .mul(BONE_REWARD)
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

    // FN uses constants 0-3
    const valTierAddress = op(Opcode.val, 4);
    const valBaseRewardPerTier = op(Opcode.val, 5);
    const valBlocksPerYear = op(Opcode.val, 6);
    const valBOne = op(Opcode.val, 7);

    // END global constants

    // BEGIN zipmap args

    const valDuration = op(Opcode.val, arg(0));
    const valBaseReward = op(Opcode.val, arg(1));

    // END zipmap args

    // BEGIN Source snippets

    // prettier-ignore
    const REWARD = () =>
      concat([
        op(Opcode.mul, 2),
          valBaseReward,
          valDuration,
      ]);

    // prettier-ignore
    const PROGRESS = () =>
      concat([
        op(Opcode.min, 2),
          op(Opcode.div, 2),
            op(Opcode.mul, 2),
              valBOne,
              valDuration,
            valBlocksPerYear,
          valBOne,
      ]);

    // prettier-ignore
    const MULTIPLIER = () =>
      concat([
        op(Opcode.add, 2),
          valBOne,
          PROGRESS(),
      ]);

    // prettier-ignore
    const FN = () =>
      concat([
        op(Opcode.mul, 2),
          MULTIPLIER(),
          REWARD(),
      ]);

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
        op(
          Opcode.updateBlocksForTierRange,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
        ),
          op(Opcode.never),
          op(Opcode.blockNumber),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
        op(Opcode.report),
          op(Opcode.thisAddress),
          op(Opcode.account),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
        op(Opcode.report),
          valTierAddress,
          op(Opcode.account),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
        op(Opcode.diff),
          CURRENT_BLOCK_AS_REPORT(),
          op(Opcode.anyLteMax, 2),
            LAST_CLAIM_REPORT(),
            TIER_REPORT(),
          op(Opcode.blockNumber),
      ]);

    // prettier-ignore
    const SOURCE = () =>
      concat([
        op(Opcode.add, 8),
          op(Opcode.zipmap, Util.callSize(0, 3, 1)),
            op(Opcode.val, 0), // fn0
            valBaseRewardPerTier, // val1
            TIERWISE_DIFF(), // val0
      ]);

    const constants = [
      ...chunkedSource(concat([FN()])),
      readWriteTier.address,
      BASE_REWARD_PER_TIER,
      BLOCKS_PER_YEAR,
      BONE,
    ];

    // END Source snippets

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: chunkedSource(concat([SOURCE()])),
          constants,
          arguments: [],
        },
      }
    );

    // Has Platinum Tier
    await readWriteTier.setTier(claimer.address, Tier.FOUR, []);

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
      BONE
    )
      ? fractionalClaimDurationBN
      : BONE;

    // 1501369863013698630
    const fractionalClaimDurationRemoveExcessAddOneBN =
      fractionalClaimDurationRemoveExcessBN.add(BONE);

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
      .div(BONE_REWARD); // reduce by reward per block scaler

    // When using calculateClaim, the calling contract will need to scale the reward per block to increase precision (to avoid a reward per block less than 1), and scale the result back down.
    const claimAmount = (
      await emissionsERC20.calculateClaim(claimer.address)
    ).div(BONE_REWARD);

    console.log(`expectations:
    claimDuration                 ${claimDuration}
    claimDurationBN               ${claimDurationBN}
    fractionalClaimDurationBN     ${fractionalClaimDurationBN}
    baseRewardByDurationBronze    ${baseRewardByDurationBronze}
    baseRewardByDurationSilver    ${baseRewardByDurationSilver}
    baseRewardByDurationGold      ${baseRewardByDurationGold}
    baseRewardByDurationPlatinum  ${baseRewardByDurationPlatinum}
    sumBaseRewardByDuration       ${sumBaseRewardByDuration}
    expectedClaimAmount           ${expectedClaimAmount}
    `);

    assert(
      claimAmount.eq(expectedClaimAmount),
      `wrong claim calculation result
      expected  ${expectedClaimAmount}
      got       ${claimAmount}`
    );
  });

  xit("should correctly mint ERC20 tokens upon a successive claim", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [
            // prettier-ignore
            concat([
              op(Opcode.diff),

                op(
                  Opcode.updateBlocksForTierRange,
                  claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
                ),
                  op(Opcode.never),
                  op(Opcode.blockNumber),

                op(Opcode.everyLteMax, 2),

                  // lastClaimReport
                  op(Opcode.report),
                    op(Opcode.thisAddress),
                    op(Opcode.account),

                  // tierReport
                  op(Opcode.report),
                    op(Opcode.val, 0),
                    op(Opcode.account),

                op(Opcode.blockNumber),
            ]),
            0,
            0,
            0,
          ],
          constants: [
            readWriteTier.address,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          arguments: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }
    );

    await readWriteTier.setTier(claimer.address, Tier.ONE, []);
    await readWriteTier.setTier(claimer.address, Tier.TWO, []);
    await readWriteTier.setTier(claimer.address, Tier.THREE, []);
    await readWriteTier.setTier(claimer.address, Tier.FOUR, []);

    await Util.createEmptyBlock(5);

    // first claim
    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const expectedClaimAmount1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(6) +
          paddedUInt32(7) +
          paddedUInt32(8) +
          paddedUInt32(9)
      )
    );
    const totalSupply1 = paddedUInt256(await emissionsERC20.totalSupply());
    const claimerBalance1 = paddedUInt256(
      await emissionsERC20.balanceOf(claimer.address)
    );

    assert(
      totalSupply1 === expectedClaimAmount1,
      `wrong total minted supply
      expected  ${expectedClaimAmount1}
      got       ${totalSupply1}`
    );
    assert(
      claimerBalance1 === expectedClaimAmount1,
      `wrong claimer balance
      expected  ${expectedClaimAmount1}
      got       ${claimerBalance1}`
    );

    await Util.createEmptyBlock(5);

    // second claim
    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const expectedClaimAmount2 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(6 + 6) +
          paddedUInt32(7 + 6) +
          paddedUInt32(8 + 6) +
          paddedUInt32(9 + 6)
      )
    );
    const totalSupply2 = paddedUInt256(await emissionsERC20.totalSupply());
    const claimerBalance2 = paddedUInt256(
      await emissionsERC20.balanceOf(claimer.address)
    );

    assert(
      totalSupply2 === expectedClaimAmount2,
      `wrong total minted supply
        expected  ${expectedClaimAmount2}
        got       ${totalSupply2}`
    );
    assert(
      claimerBalance2 === expectedClaimAmount2,
      `wrong claimer balance
        expected  ${expectedClaimAmount2}
        got       ${claimerBalance2}`
    );
  });

  it("should return default claim report for an account before claiming", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [
            concat([
              // lastClaimReport
              op(Opcode.report),
              op(Opcode.thisAddress),
              op(Opcode.account),
            ]),
            0,
            0,
            0,
          ],
          constants: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          arguments: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }
    );

    const beforeClaimReport = await emissionsERC20.calculateClaim(
      claimer.address
    );

    assert(
      beforeClaimReport.eq(Util.NEVER),
      `wrong emissions report before claim
      expected  ${Util.NEVER}
      got       ${hexlify(beforeClaimReport)}`
    );
  });

  xit("should correctly calculate claim amount after a claim", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [
            concat([
              op(Opcode.diff),

              op(
                Opcode.updateBlocksForTierRange,
                claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
              ),
              op(Opcode.never),
              op(Opcode.blockNumber),

              op(Opcode.everyLteMax, 2),

              // lastClaimReport
              op(Opcode.report),
              op(Opcode.thisAddress),
              op(Opcode.account),

              // tierReport
              op(Opcode.report),
              op(Opcode.val, 0),
              op(Opcode.account),

              op(Opcode.blockNumber),
            ]),
            0,
            0,
            0,
          ],
          constants: [
            readWriteTier.address,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          arguments: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }
    );

    await readWriteTier.setTier(claimer.address, Tier.ONE, []);
    await readWriteTier.setTier(claimer.address, Tier.TWO, []);
    await readWriteTier.setTier(claimer.address, Tier.THREE, []);
    await readWriteTier.setTier(claimer.address, Tier.FOUR, []);

    await Util.createEmptyBlock(5);

    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const successiveClaimCalc0 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimer.address)
    );
    const expectedClaimCalc0 = paddedUInt256(
      ethers.BigNumber.from("0x" + paddedUInt32(0).repeat(8))
    );

    assert(
      successiveClaimCalc0 === expectedClaimCalc0,
      `wrong successive claim calculation0
      expected  ${expectedClaimCalc0}
      got       ${successiveClaimCalc0}`
    );

    await Util.createEmptyBlock(5);

    const successiveClaimCalc1 = paddedUInt256(
      await emissionsERC20.calculateClaim(claimer.address)
    );
    const expectedClaimCalc1 = paddedUInt256(
      ethers.BigNumber.from(
        "0x" + paddedUInt32(0).repeat(4) + paddedUInt32(5).repeat(4)
      )
    );

    assert(
      successiveClaimCalc1 === expectedClaimCalc1,
      `wrong successive claim calculation1
        expected  ${expectedClaimCalc1}
        got       ${successiveClaimCalc1}`
    );
  });

  xit("should correctly mint ERC20 tokens upon a claim", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [
            concat([
              op(Opcode.diff),

              op(
                Opcode.updateBlocksForTierRange,
                claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
              ),
              op(Opcode.never),
              op(Opcode.blockNumber),

              op(Opcode.everyLteMax, 2),

              // lastClaimReport
              op(Opcode.report),
              op(Opcode.thisAddress),
              op(Opcode.account),

              // tierReport
              op(Opcode.report),
              op(Opcode.val, 0),
              op(Opcode.account),

              op(Opcode.blockNumber),
            ]),
            0,
            0,
            0,
          ],
          constants: [
            readWriteTier.address,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          arguments: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }
    );

    await readWriteTier.setTier(claimer.address, Tier.ONE, []);
    await readWriteTier.setTier(claimer.address, Tier.TWO, []);
    await readWriteTier.setTier(claimer.address, Tier.THREE, []);
    await readWriteTier.setTier(claimer.address, Tier.FOUR, []);

    await Util.createEmptyBlock(5);

    assert(
      (await emissionsERC20.totalSupply()).isZero(),
      "total supply not zero"
    );

    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const expectedClaimAmount = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(6) +
          paddedUInt32(7) +
          paddedUInt32(8) +
          paddedUInt32(9)
      )
    );
    const totalSupply1 = paddedUInt256(await emissionsERC20.totalSupply());
    const claimerBalance1 = paddedUInt256(
      await emissionsERC20.balanceOf(claimer.address)
    );

    assert(
      totalSupply1 === expectedClaimAmount,
      `wrong total minted supply
      expected  ${expectedClaimAmount}
      got       ${totalSupply1}`
    );
    assert(
      claimerBalance1 === expectedClaimAmount,
      `wrong claimer balance
      expected  ${expectedClaimAmount}
      got       ${claimerBalance1}`
    );
  });

  it("should calculate claim report as difference between current block number and everyLteMax([tierReport, lastClaimReport]) for each tier", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    // prettier-ignore
    const CURRENT_BLOCK_AS_REPORT = () =>
      concat([
        op(
          Opcode.updateBlocksForTierRange,
          claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
        ),
          op(Opcode.never),
          op(Opcode.blockNumber),
      ]);

    // prettier-ignore
    const LAST_CLAIM_REPORT = () =>
      concat([
        op(Opcode.report),
          op(Opcode.thisAddress),
          op(Opcode.account),
      ]);

    // prettier-ignore
    const TIER_REPORT = () =>
      concat([
        op(Opcode.report),
          op(Opcode.val, 0),
          op(Opcode.account),
      ]);

    // prettier-ignore
    const TIERWISE_DIFF = () =>
      concat([
        op(Opcode.diff),
          CURRENT_BLOCK_AS_REPORT(),
          op(Opcode.anyLteMax, 2),
            LAST_CLAIM_REPORT(),
            TIER_REPORT(),
          op(Opcode.blockNumber),
      ]);

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [TIERWISE_DIFF(), 0, 0, 0],
          constants: [
            readWriteTier.address,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          arguments: [],
        },
      }
    );

    await readWriteTier.setTier(claimer.address, Tier.ONE, []);
    await readWriteTier.setTier(claimer.address, Tier.TWO, []);
    await readWriteTier.setTier(claimer.address, Tier.THREE, []);
    await readWriteTier.setTier(claimer.address, Tier.FOUR, []);

    await Util.createEmptyBlock(5);

    const claimReport = paddedUInt256(
      await emissionsERC20.calculateClaim(claimer.address)
    );
    const expectedClaimReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(0).repeat(4) +
          paddedUInt32(5) +
          paddedUInt32(6) +
          paddedUInt32(7) +
          paddedUInt32(8)
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
    const claimer = signers[1];

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const { emissionsERC20Factory } = await claimUtil.claimFactoriesDeploy();

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [
            concat([
              op(Opcode.diff),
              op(
                Opcode.updateBlocksForTierRange,
                claimUtil.tierRange(Tier.ZERO, Tier.EIGHT)
              ),
              op(Opcode.never),
              op(Opcode.blockNumber),

              op(Opcode.report),
              op(Opcode.val, 0),
              op(Opcode.account),
            ]),
            0,
            0,
            0,
          ],
          constants: [
            readWriteTier.address,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ],
          arguments: [],
        },
      }
    );

    const setTierBlock = (await ethers.provider.getBlockNumber()) + 1;
    await readWriteTier.setTier(claimer.address, Tier.EIGHT, []);

    await Util.createEmptyBlock(5);

    const calculationBlock = await ethers.provider.getBlockNumber();
    const diffResult = await emissionsERC20.calculateClaim(claimer.address);

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
    const claimer = signers[1];

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
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [claimAmount],
          arguments: [],
        },
      }
    );

    const claimBlockNumber = (await ethers.provider.getBlockNumber()) + 1;

    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );

    const expectedReport = paddedUInt256(
      ethers.BigNumber.from("0x" + paddedUInt32(claimBlockNumber).repeat(8))
    );

    const actualReport = paddedUInt256(
      await emissionsERC20.reports(claimer.address)
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
    const claimer = signers[1];
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
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [claimAmount],
          arguments: [],
        },
      }
    );

    await emissionsERC20
      .connect(delegate)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );
  });

  it("should prevent delegated claims when flag set to false", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];
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
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [claimAmount],
          arguments: [],
        },
      }
    );

    assert(!(await emissionsERC20.allowDelegatedClaims()));

    await Util.assertError(
      async () =>
        await emissionsERC20
          .connect(delegate)
          .claim(
            claimer.address,
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
    const claimer = signers[1];

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
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [claimAmount],
          arguments: [],
        },
      }
    );

    await emissionsERC20
      .connect(claimer)
      .claim(
        claimer.address,
        hexlify([...Buffer.from("Custom claim message")])
      );
  });

  it("should calculate claim amount from constant val", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

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
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [claimAmount],
          arguments: [],
        },
      }
    );

    const claimAmountResult = await emissionsERC20.calculateClaim(
      claimer.address
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

    const constructionBlockNumber =
      (await ethers.provider.getBlockNumber()) + 1;

    const emissionsERC20 = await claimUtil.emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
        },
        source: {
          source: [concat([op(Opcode.val)])],
          constants: [],
          arguments: [],
        },
      }
    );

    assert(await emissionsERC20.allowDelegatedClaims());
    assert(
      (await emissionsERC20.constructionBlockNumber()) ===
        constructionBlockNumber,
      `wrong construction block number
      expected  ${constructionBlockNumber}
      got       ${await emissionsERC20.constructionBlockNumber()}`
    );
  });
});
