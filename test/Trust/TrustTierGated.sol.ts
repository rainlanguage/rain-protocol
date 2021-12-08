import { ethers, artifacts } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../../typechain/Trust";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../Util";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import { factoriesDeploy } from "../Util";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { ConfigurableRightsPool } from "../../typechain/ConfigurableRightsPool";
import type { BPool } from "../../typechain/BPool";
import type { Contract } from "ethers";
import { hexlify } from "ethers/lib/utils";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

enum Phase {
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

/**
 * Tests for realistic non-NIL Tier scenarios
 *
 * Most tests are duplicates of or adapted from existing tests which previously had a minimum status of Tier.NIL
 */

describe("TrustTierGated (non-NIL minimum tier)", async function () {
  it("should burn token dust when closing pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    // tiers should be in place before RedeemableERC20 reserve construction
    await tier.setTier(signer1.address, Tier.GOLD, []);

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        redeemInit,
        seedERC20Config,
      },
      {
        erc20Config,
        tier: tier.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;
    const pool = new ethers.Contract(
      await trust.pool(),
      (await artifacts.readArtifact("RedeemableERC20Pool")).abi,
      creator
    ) as RedeemableERC20Pool & Contract;
    const crp = new ethers.Contract(
      await pool.crp(),
      (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
      creator
    ) as ConfigurableRightsPool & Contract;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      (await artifacts.readArtifact("BPool")).abi,
      creator
    ) as BPool & Contract;

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      await reserve.connect(signer).approve(bPool.address, spend);
      await crp.connect(signer).pokeWeights();
      await bPool
        .connect(signer)
        .swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.eighteenZeros)
        );
    };

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);

    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signer1.address, 0);
    }

    const tokenInPoolBeforeExit = await token.balanceOf(bPool.address);

    await trust.anonEndDistribution();

    const tokenInPoolAfterExit = await token.balanceOf(bPool.address);

    assert(
      tokenInPoolAfterExit.isZero(),
      `did not burn token dust
      expected 0 got ${tokenInPoolAfterExit}
      ----
      tokenInPoolBeforeExit ${tokenInPoolBeforeExit}
      `
    );
  });
});
