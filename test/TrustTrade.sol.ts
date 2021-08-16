import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust";
import type { ReserveToken } from "../typechain/ReserveToken";
import * as Util from "./Util";
import { utils } from "ethers";
import type { Prestige } from "../typechain/Prestige";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import type { RedeemableERC20 } from "../typechain/RedeemableERC20";
import type { ConfigurableRightsPool } from "../typechain/ConfigurableRightsPool";
import { factoriesDeploy } from "./Util";

chai.use(solidity);
const { expect, assert } = chai;

const trustJson = require("../artifacts/contracts/Trust.sol/Trust.json");
const poolJson = require("../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const bPoolJson = require("../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json");
const reserveJson = require("../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json");
const redeemableTokenJson = require("../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json");
const crpJson = require("../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json");

enum Status {
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

describe("TrustTrade", async function () {
  it("should allow token transfers before redemption phase if and only if receiver has the minimum prestige level set OR the receiver does NOT have the status but is unfreezable", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = Status.GOLD;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signerBronze = signers[3];
    const signerSilver = signers[4];
    const signerGold = signers[5];
    const signerPlatinum = signers[6];

    // Set prestige levels
    await prestige.setStatus(signerBronze.address, Status.BRONZE, []);
    await prestige.setStatus(signerSilver.address, Status.SILVER, []);
    await prestige.setStatus(signerGold.address, Status.GOLD, []);
    await prestige.setStatus(signerPlatinum.address, Status.PLATINUM, []);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;
    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const reserveSpend = ethers.BigNumber.from("10" + Util.sixZeros);

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await reserveSigner.approve(bPool.address, spend);
      await crpSigner.pokeWeights();
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    // bronze signer attempts swap for tokens
    await Util.assertError(
      async () => await swapReserveForTokens(signerBronze, reserveSpend),
      "revert MIN_STATUS",
      "bronze signer swapped reserve for tokens, despite being below min status of gold"
    );

    // TODO: all signers attempt swap

    // TODO: test token transfers before redemption phase
  });

  it("should set unnecessary configurable rights to 0", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = Status.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator) as RedeemableERC20Pool;
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator) as ConfigurableRightsPool;

    const expectedRights = [false, false, true, true, false, false];

    let expectedRightPool;
    for (let i = 0; (expectedRightPool = expectedRights[i]); i++) {
      const actualRight = await pool.rights(i);
      assert(
        actualRight === expectedRightPool,
        `wrong right ${i} ${expectedRightPool} ${actualRight}`
      );
    }

    let expectedRightCrp;

    for (let i = 0; (expectedRightCrp = expectedRights[i]); i++) {
      // @ts-ignore
      const actualRight = await crp.rights(i);
      assert(
        actualRight === expectedRightCrp,
        `wrong right ${i} ${expectedRightCrp} ${actualRight}`
      );
    }
  });

  it("should achieve correct spot price curve during trading period (without trading)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = Status.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();
    const nextPhaseBlock = startBlock + minimumTradingDuration;

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;
    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const reserveAmountStart = await reserve.balanceOf(bPool.address);
    const tokenAmountStart = await token.balanceOf(bPool.address);

    const block25Percent = startBlock + minimumTradingDuration / 4;
    const block50Percent = startBlock + minimumTradingDuration / 2;
    const block75Percent = startBlock + (minimumTradingDuration * 3) / 4;
    const block100Percent = nextPhaseBlock;

    await crp.pokeWeights();

    const spotPriceInit = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    let spotPrices = [spotPriceInit];
    const spotBlocks = [startBlock];

    // 25% through raise duration
    while ((await ethers.provider.getBlockNumber()) < block25Percent - 1) {
      await reserve.transfer(signers[3].address, 0);
    }

    const reserveAmount25 = await reserve.balanceOf(bPool.address);
    const tokenAmount25 = await token.balanceOf(bPool.address);

    assert(
      reserveAmount25.eq(reserveAmountStart),
      "reserve amount changed with no trading"
    );
    assert(
      tokenAmount25.eq(tokenAmountStart),
      "token amount changed with no trading"
    );

    await crp.pokeWeights();

    const spotPrice25 = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    spotPrices.push(spotPrice25);
    spotBlocks.push(await ethers.provider.getBlockNumber());

    // 50% through raise duration
    while ((await ethers.provider.getBlockNumber()) < block50Percent - 1) {
      await reserve.transfer(signers[3].address, 0);
    }

    const reserveAmount50 = await reserve.balanceOf(bPool.address);
    const tokenAmount50 = await token.balanceOf(bPool.address);

    assert(
      reserveAmount50.eq(reserveAmountStart),
      "reserve amount changed with no trading"
    );
    assert(
      tokenAmount50.eq(tokenAmountStart),
      "token amount changed with no trading"
    );

    await crp.pokeWeights();

    const spotPrice50 = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    spotPrices.push(spotPrice50);
    spotBlocks.push(await ethers.provider.getBlockNumber());

    // 75% through raise duration
    while ((await ethers.provider.getBlockNumber()) < block75Percent - 1) {
      await reserve.transfer(signers[3].address, 0);
    }

    const reserveAmount75 = await reserve.balanceOf(bPool.address);
    const tokenAmount75 = await token.balanceOf(bPool.address);

    assert(
      reserveAmount75.eq(reserveAmountStart),
      "reserve amount changed with no trading"
    );
    assert(
      tokenAmount75.eq(tokenAmountStart),
      "token amount changed with no trading"
    );

    await crp.pokeWeights();

    const spotPrice75 = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    spotPrices.push(spotPrice75);
    spotBlocks.push(await ethers.provider.getBlockNumber());

    // 100% through raise duration
    while ((await ethers.provider.getBlockNumber()) < block100Percent - 1) {
      await reserve.transfer(signers[3].address, 0);
    }

    const reserveAmountFinal = await reserve.balanceOf(bPool.address);
    const tokenAmountFinal = await token.balanceOf(bPool.address);

    assert(
      reserveAmountFinal.eq(reserveAmountStart),
      "reserve amount changed with no trading"
    );
    assert(
      tokenAmountFinal.eq(tokenAmountStart),
      "token amount changed with no trading"
    );

    await crp.pokeWeights();

    const spotPriceFinal = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    spotPrices.push(spotPriceFinal);
    spotBlocks.push(await ethers.provider.getBlockNumber());

    spotPrices = spotPrices.map((spotPrice) =>
      spotPrice.div("100000000000000")
    ); // reduce scale

    // end raise to confirm raise is finished.
    await trust.anonEndDistribution();

    // // check linearity
    // const regression = linearRegression([spotBlocks, spotPrices.map(Number)]);
    // const regressionLine = linearRegressionLine(regression);
    // const rSqrd = rSquared(
    //   [spotBlocks, spotPrices.map(Number)],
    //   regressionLine
    // ); // = 1 this line is a perfect fit

    // assert(rSqrd === 1, "weights curve was not linear");

    // const expectedFinalSpotPrice = finalValuation
    //   .mul(Util.ONE)
    //   .div(totalTokenSupply);
    // assert(
    //   spotPriceFinal.eq(expectedFinalSpotPrice),
    //   `wrong final valuation with no trading ${expectedFinalSpotPrice} ${spotPriceFinal}`
    // );
  });

  it("should set minimum prestige level for pool, where only members with prestige level or higher can transact in pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = Status.GOLD;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signerSilver = signers[3];
    const signerGold = signers[4];
    const signerPlatinum = signers[5];

    // Set prestige levels
    await prestige.setStatus(signerSilver.address, Status.SILVER, []);
    await prestige.setStatus(signerGold.address, Status.GOLD, []);
    await prestige.setStatus(signerPlatinum.address, Status.PLATINUM, []);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const bPoolSilver = bPool.connect(signerSilver);
    const reserveSilver = reserve.connect(signerSilver);
    const crpSilver = crp.connect(signerSilver);

    const bPoolGold = bPool.connect(signerGold);
    const reserveGold = reserve.connect(signerGold);
    const crpGold = crp.connect(signerGold);

    const bPoolPlatinum = bPool.connect(signerPlatinum);
    const reservePlatinum = reserve.connect(signerPlatinum);
    const crpPlatinum = crp.connect(signerPlatinum);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer 1 needs some reserve
    await reserve.transfer(
      signerSilver.address,
      ethers.BigNumber.from("100000" + Util.sixZeros)
    );

    const reserveSpend = ethers.BigNumber.from("10" + Util.sixZeros);

    await reserve.transfer(signerGold.address, reserveSpend);
    await reserve.transfer(signerPlatinum.address, reserveSpend);

    const swapReserveForTokens = async (spend, crp, reserve, bPool) => {
      await crp.pokeWeights();
      await reserve.approve(bPool.address, spend);
      await bPool.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    // silver signer get some redeemable tokens
    await Util.assertError(
      async () =>
        await swapReserveForTokens(
          reserveSpend,
          crpSilver,
          reserveSilver,
          bPoolSilver
        ),
      "revert MIN_STATUS",
      "Silver signer swapped reserve for tokens, despite being below min status of Gold"
    );

    // gold signer get some redeemable tokens
    await swapReserveForTokens(reserveSpend, crpGold, reserveGold, bPoolGold);

    // platinum signer get some redeemable tokens
    await swapReserveForTokens(
      reserveSpend,
      crpPlatinum,
      reservePlatinum,
      bPoolPlatinum
    );

    console.log(
      `signer silver token balance ${await token.balanceOf(
        signerSilver.address
      )}`
    );
    console.log(
      `signer gold token balance ${await token.balanceOf(signerGold.address)}`
    );
    console.log(
      `signer platinum token balance ${await token.balanceOf(
        signerPlatinum.address
      )}`
    );
  });

  it("should not hit max weight (50:1) during weight changes", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = Status.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    // initial reserve and token supply 1:1 for simplicity
    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);

    const initialValuation1 = ethers.BigNumber.from("100000" + Util.sixZeros);
    const initialValuation2 = ethers.BigNumber.from("10000" + Util.sixZeros);

    const totalTokenSupply1 = ethers.BigNumber.from(
      "2000" + Util.eighteenZeros
    );
    const totalTokenSupply2 = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );

    // Token spot price = initial valuation / total token
    // const spotInit = initialValuation.div(totalTokenSupply)

    // Weight ratio
    // Wt / Wr = Spot * Bt / Br

    // Bt / Br = 1 (in our case)
    // Hence, Wt / Wr = Spot

    // console.log(`Weight Ratio Wt/Wr ${
    //   spotInit
    //   .mul(redeemInit.div(reserveInit)
    // )}`);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory2 = trustFactory.connect(deployer);

    assert(
      initialValuation1
        .mul(Util.ONE)
        .div(totalTokenSupply1)
        .gte(ethers.BigNumber.from("50" + Util.sixZeros)),
      "wrong intended spot price for max weight test"
    );

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory2,
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seeder: seeder.address,
            seederFee,
            seederUnits,
            seederCooldownDuration,
            minimumTradingDuration,
            redeemInit,
          },
          {
            name: tokenName,
            symbol: tokenSymbol,
            prestige: prestige.address,
            minimumStatus,
            totalSupply: totalTokenSupply1,
          },
          {
            reserve: reserve.address,
            reserveInit,
            initialValuation: initialValuation1,
            finalValuation: successLevel,
          },
          { gasLimit: 100000000 }
        ),
      "revert MAX_WEIGHT_VALUATION",
      "wrongly deployed trust with pool at 50:1 weight ratio"
    );

    const ONE_SIX = ethers.BigNumber.from("1" + Util.sixZeros);

    // Ratio = initialValuation2 / totalTokenSupply1 = 5
    const expectedRatio = 5;
    const actualRatio = initialValuation2
      .mul(Util.ONE)
      .div(totalTokenSupply1)
      .div(ONE_SIX);

    assert(
      actualRatio.eq(expectedRatio),
      `wrong spot price for a valid pool
      expected ratio  ${expectedRatio}
      actual ratio    ${actualRatio}`
    );

    const trust = await Util.trustDeploy(
      trustFactory2,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply1,
      },
      {
        reserve: reserve.address,
        reserveInit,
        initialValuation: initialValuation1,
        finalValuation: successLevel,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const bPool1 = bPool.connect(signer1);
    const reserve1 = reserve.connect(signer1);
    const crp1 = crp.connect(signer1);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer 1 needs some reserve
    await reserve.transfer(
      signer1.address,
      ethers.BigNumber.from("100000" + Util.sixZeros)
    );

    const spend = ethers.BigNumber.from("1" + Util.sixZeros);

    // do some swaps
    // TODO: Fuzz testing
    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration - 1
    ) {
      await crp1.pokeWeights();
      await reserve1.approve(bPool1.address, spend);
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    }
  });
});
