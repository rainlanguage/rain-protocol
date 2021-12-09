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
  it("should refund users", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
    const signer2 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.CHAD, []);

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100000" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 15;

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

    await reserve.transfer(await trust.pool(), reserveInit);

    const pool = new ethers.Contract(
      await trust.pool(),
      (await artifacts.readArtifact("RedeemableERC20Pool")).abi,
      creator
    ) as RedeemableERC20Pool & Contract;

    await pool.startDutchAuction({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // have a few signers buy some tokens
    await reserve.transfer(
      signer1.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
    );
    await reserve.transfer(
      signer2.address,
      ethers.BigNumber.from("2000" + Util.sixZeros)
    );

    const [crp, bPool] = await Util.poolContracts(signers, pool);

    const bPool1 = bPool.connect(signer1);
    const reserve1 = reserve.connect(signer1);
    await reserve1.approve(
      bPool1.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
    );

    await bPool1.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from("1000" + Util.sixZeros),
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.sixZeros)
    );
    const crp2 = crp.connect(signer2);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(signer2);
    const reserve2 = reserve.connect(signer2);
    await reserve2.approve(
      bPool2.address,
      ethers.BigNumber.from("2000" + Util.sixZeros)
    );

    await bPool2.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from("2000" + Util.sixZeros),
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.sixZeros)
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signer1.address, 1);
    }

    await trust.anonEndDistribution();

    const token1 = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      signer1
    ) as RedeemableERC20 & Contract;
    await token1.redeem(
      [reserve.address],
      await token1.balanceOf(signer1.address)
    );
    const reserveBalance1 = await reserve.balanceOf(signer1.address);
    const expectedBalance1 = "841344575";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong balance 1 after redemption: ${reserveBalance1} ${expectedBalance1}`
    );

    const token2 = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      signer2
    ) as RedeemableERC20 & Contract;
    await token2.redeem(
      [reserve.address],
      await token1.balanceOf(signer2.address)
    );
    const reserveBalance2 = await reserve.balanceOf(signer2.address);
    const expectedBalance2 = "2158655434";
    assert(
      ethers.BigNumber.from(expectedBalance2).eq(reserveBalance2),
      `wrong balance 2 after redemption: ${reserveBalance2} ${expectedBalance2}`
    );
  });

  it("should be able to exit trust if creator does not end raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.PLATINUM;

    await tier.setTier(signer1.address, Tier.JAWAD, []);

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

    const minimumTradingDuration = 10;

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

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      await reserve.balanceOf(signers[0].address)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken & Contract;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const pool = new ethers.Contract(
      await trust.pool(),
      (await artifacts.readArtifact("RedeemableERC20Pool")).abi,
      creator
    ) as RedeemableERC20Pool & Contract;

    await pool.startDutchAuction({
      gasLimit: 100000000,
    });

    const startBlock = await ethers.provider.getBlockNumber();

    const trust2 = new ethers.Contract(
      trust.address,
      trust.interface,
      signer1
    ) as Trust & Contract;
    // some other signer triggers trust to exit before phase change, should fail
    await Util.assertError(
      async () => await trust2.anonEndDistribution(),
      "BAD_PHASE",
      "trust exited before phase change"
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserveSeeder.transfer(seeder.address, 1);
    }

    // some other signer triggers trust to exit after phase change, should succeed
    await trust2.anonEndDistribution();

    // trust should no longer hold any reserve
    assert(
      (await reserve.balanceOf(trust.address)).eq(0),
      "trust still holds non-zero reserve balance"
    );
  });

  it("should transfer correct value to all stakeholders after failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.DIAMOND, []);

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
    const minimumCreatorRaise = ethers.BigNumber.from("10000" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(
      seeder.address
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // give holders some reserve (not enough for successful raise)
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users FAIL to hit the minimum raise

    const [crp, bPool] = await Util.poolContracts(signers, pool);
    const reserve1 = reserve.connect(signer1);

    const crp1 = crp.connect(signer1);
    const bPool1 = bPool.connect(signer1);

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights(); // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1); // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"), // minimum out, otherwise revert
        ethers.BigNumber.from("1000000" + Util.sixZeros) // max price, otherwise revert
      );
      i++;
    }

    const signer1TokenBalance = await token.balanceOf(signer1.address);

    // signer 1 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(signer1.address)).eq(0),
      "balancer pool not swapping correct spend1 amount in"
    );

    const crp2 = crp.connect(signer2);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(signer2);
    const reserve2 = reserve.connect(signer2);
    await reserve2.approve(bPool2.address, spend2);

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.sixZeros)
    );

    const signer2TokenBalance = await token.balanceOf(signer2.address);

    // signer 2 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(signer2.address)).eq(0),
      "balancer pool not swapping correct spend2 amount in"
    );

    // END: users hit the minimum raise

    let countTransfersToTriggerPhaseChange = 0;
    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 1);
      countTransfersToTriggerPhaseChange++;
    }

    const finalBalance = await reserve.balanceOf(await bPool.address);

    // raise should fail
    assert(
      finalBalance.lt(successLevel),
      `raise was successful
    final ${finalBalance}
    success ${successLevel}`
    );

    assert(
      !finalBalance.eq(0),
      `got zero final balance ${await bPool.address}`
    );

    await trust.anonEndDistribution();

    const creatorEndingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // Creator has correct final balance

    // on failed raise, creator gets nothing
    assert(
      creatorEndingReserveBalance.eq(
        creatorStartingReserveBalance.sub(countTransfersToTriggerPhaseChange)
      ),
      `creator balance changed after failed raise
      ending balance ${creatorEndingReserveBalance}
      starting balance ${creatorStartingReserveBalance}
      countTransfers ${countTransfersToTriggerPhaseChange}
      expectedBalance ${creatorStartingReserveBalance.sub(
        countTransfersToTriggerPhaseChange
      )}
    `
    );

    // Seeder has correct final balance

    // on failed raise, seeder gets reserveInit or final balance back, depending on whatever is smaller
    // in this case, reserve init is smaller
    assert(
      reserveInit.lt(finalBalance),
      "reserve init wasn't smaller than final balance"
    );

    const poolDust = await reserve.balanceOf(bPool.address);
    const seederEndExpected = seederStartingReserveBalance.sub(poolDust);
    const seederEndActual = await reserve.balanceOf(seeder.address);

    assert(
      seederEndActual.eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after failed raise ended ${seederEndActual} ${seederEndExpected}`
    );

    // Token holders have correct final balance of reserve and tokens

    // correct reserve
    assert(
      (await reserve.balanceOf(signer1.address)).eq(0),
      "signer 1 wrongly given reserve when raise ended"
    );
    assert(
      (await reserve.balanceOf(signer2.address)).eq(0),
      "signer 2 wrongly given reserve when raise ended"
    );

    const signer1EndingTokenBalance = await token.balanceOf(signer1.address);
    const signer2EndingTokenBalance = await token.balanceOf(signer2.address);

    // Should remain unchanged from amounts during pool phase
    const signer1ExpectedEndingTokenBalance = signer1TokenBalance;
    const signer2ExpectedEndingTokenBalance = signer2TokenBalance;

    // correct tokens
    assert(
      signer1EndingTokenBalance.eq(signer1ExpectedEndingTokenBalance),
      "wrong final token balance for signer 1"
    );
    assert(
      signer2EndingTokenBalance.eq(signer2ExpectedEndingTokenBalance),
      "wrong final token balance for signer 2"
    );

    // Token contract holds correct reserve balance
    const expectedRemainderReserveBalance = finalBalance.sub(reserveInit);
    const remainderReserveBalance = await reserve.balanceOf(token.address);

    assert(
      remainderReserveBalance.eq(expectedRemainderReserveBalance),
      `token contract did not receive remainder ${expectedRemainderReserveBalance} ${remainderReserveBalance}`
    );

    assert(
      (await token.totalSupply()).eq(
        signer1EndingTokenBalance
          .add(signer2EndingTokenBalance)
          .add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after failed raise
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${signer1EndingTokenBalance}
      balanceOf signer 2  ${signer2EndingTokenBalance}
      `
    );

    // token supply is burned correctly on redemption

    // redeem all
    await token
      .connect(signer1)
      .redeem([reserve.address], signer1EndingTokenBalance);

    assert(
      (await token.totalSupply()).eq(
        signer2EndingTokenBalance.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after signer 1 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${await token.balanceOf(signer1.address)}
      balanceOf signer 2  ${await token.balanceOf(signer2.address)}
      `
    );

    const smallTokenAmount = ethers.BigNumber.from("1" + Util.eighteenZeros);

    // redeem almost all tokens
    await token
      .connect(signer2)
      .redeem(
        [reserve.address],
        signer2EndingTokenBalance.sub(smallTokenAmount)
      );

    assert(
      (await token.totalSupply()).eq(
        smallTokenAmount.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after signer 2 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${await token.balanceOf(signer1.address)}
      balanceOf signer 2  ${await token.balanceOf(signer2.address)}
      `
    );
  });

  it("should transfer correct value to all stakeholders after successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    // tiers should be in place before RedeemableERC20 reserve construction
    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.DIAMOND, []);

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

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(
      seeder.address
    );

    assert(
      seederStartingReserveBalance.eq(reserveInit),
      "wrong starting balance for seeder"
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // give holders some reserve
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users hit the minimum raise

    const reserve1 = reserve.connect(signer1);

    const [crp, bPool] = await Util.poolContracts(signers, pool);

    const crp1 = crp.connect(signer1);
    const bPool1 = bPool.connect(signer1);

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights(); // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1); // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"), // minimum out, otherwise revert
        ethers.BigNumber.from("1000000" + Util.sixZeros) // max price, otherwise revert
      );

      // ? do we need to check whether swap amounts are correct?

      i++;
    }

    const signer1TokenBalance = await token.balanceOf(signer1.address);

    // signer 1 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(signer1.address)).eq(0),
      "balancer pool not swapping correct spend1 amount in"
    );

    const crp2 = crp.connect(signer2);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(signer2);
    const reserve2 = reserve.connect(signer2);
    await reserve2.approve(bPool2.address, spend2);

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.sixZeros)
    );

    const signer2TokenBalance = await token.balanceOf(signer2.address);

    // signer 2 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(signer2.address)).eq(0),
      "balancer pool not swapping correct spend2 amount in"
    );

    // END: users hit the minimum raise

    let countTransfersToTriggerPhaseChange = 0;
    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 1);
      countTransfersToTriggerPhaseChange++;
    }

    const balancerPoolReserveBalance = await reserve.balanceOf(
      await bPool.address
    );

    assert(
      !balancerPoolReserveBalance.eq(0),
      `got zero reserve balance for pool/trust ${await bPool.address}`
    );

    const seederReserveBalanceBeforeEndRaise = await reserve.balanceOf(
      seeder.address
    );

    const finalBalance = await reserve.balanceOf(bPool.address);
    const tokenPay = redeemInit;

    await trust.anonEndDistribution();

    const poolDust = await reserve.balanceOf(bPool.address);
    const availableBalance = finalBalance.sub(poolDust);
    const seederPay = reserveInit.add(seederFee).sub(poolDust);

    const creatorEndingReserveBalance = await reserve.balanceOf(
      creator.address
    );
    const expectedCreatorEndingReserveBalance = creatorStartingReserveBalance
      .add(availableBalance)
      .sub(seederPay.add(tokenPay))
      .sub(countTransfersToTriggerPhaseChange); // creator loses some reserve when moving blocks

    // Creator has correct final balance

    // creatorPay = finalBalance - (seederPay + tokenPay)
    assert(
      creatorEndingReserveBalance.eq(expectedCreatorEndingReserveBalance),
      `wrong reserve balance for creator after raise ended.
      ${creatorStartingReserveBalance} start
      ${creatorEndingReserveBalance} end
      ${expectedCreatorEndingReserveBalance} expected
      ${finalBalance} finalBalance
      ${availableBalance} availableBalance
      ${seederPay} seederPay
      ${tokenPay} tokenPay
      ${poolDust} poolDust
      ${countTransfersToTriggerPhaseChange} countTransfers
      `
    );

    // creator has no tokens
    assert(
      (await token.balanceOf(creator.address)).eq(0),
      "creator wrongly given tokens"
    );

    // Seeder has correct final balance

    // on successful raise, seeder gets reserve init + seeder fee
    const seederEndExpected = seederReserveBalanceBeforeEndRaise
      .add(reserveInit)
      .add(seederFee)
      .sub(poolDust);
    const seederEndActual = await reserve.balanceOf(seeder.address);

    assert(
      seederEndActual.eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after successful raise ended.
      Actual ${seederEndActual}
      Expected ${seederEndExpected}
      Difference ${seederEndActual.sub(seederEndExpected)}`
    );

    assert(
      (await token.balanceOf(seeder.address)).eq(0),
      "seeder wrongly given tokens"
    );

    // Token holders have correct final balance of reserve and tokens

    // correct reserve
    assert(
      (await reserve.balanceOf(signer1.address)).eq(0),
      "signer 1 wrongly given reserve when raise ended"
    );
    assert(
      (await reserve.balanceOf(signer2.address)).eq(0),
      "signer 2 wrongly given reserve when raise ended"
    );

    const signer1EndingTokenBalance = await token.balanceOf(signer1.address);
    const signer2EndingTokenBalance = await token.balanceOf(signer2.address);

    // Should remain unchanged from amounts during pool phase
    const signer1ExpectedEndingTokenBalance = signer1TokenBalance;
    const signer2ExpectedEndingTokenBalance = signer2TokenBalance;

    // correct tokens
    assert(
      signer1EndingTokenBalance.eq(signer1ExpectedEndingTokenBalance),
      "wrong final token balance for signer 1"
    );
    assert(
      signer2EndingTokenBalance.eq(signer2ExpectedEndingTokenBalance),
      "wrong final token balance for signer 2"
    );

    assert(
      (await token.totalSupply()).eq(
        signer1EndingTokenBalance
          .add(signer2EndingTokenBalance)
          .add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after successful raise
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${signer1EndingTokenBalance}
      balanceOf signer 2  ${signer2EndingTokenBalance}
      `
    );

    // token supply is burned correctly on redemption

    // redeem all
    await token
      .connect(signer1)
      .redeem([reserve.address], signer1EndingTokenBalance);

    assert(
      (await token.totalSupply()).eq(
        signer2EndingTokenBalance.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after signer 1 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${await token.balanceOf(signer1.address)}
      balanceOf signer 2  ${await token.balanceOf(signer2.address)}
      `
    );

    const smallTokenAmount = ethers.BigNumber.from("1" + Util.eighteenZeros);

    // redeem almost all tokens
    await token
      .connect(signer2)
      .redeem(
        [reserve.address],
        signer2EndingTokenBalance.sub(smallTokenAmount)
      );

    assert(
      (await token.totalSupply()).eq(
        smallTokenAmount.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after signer 2 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator.address)}
      balanceOf seeder    ${await token.balanceOf(seeder.address)}
      balanceOf signer 1  ${await token.balanceOf(signer1.address)}
      balanceOf signer 2  ${await token.balanceOf(signer2.address)}
      `
    );
  });

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
