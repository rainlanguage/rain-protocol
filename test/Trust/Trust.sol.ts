import { ethers } from "hardhat";
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

chai.use(solidity);
const { expect, assert } = chai;

const trustJson = require("../../artifacts/contracts/Trust.sol/Trust.json");
const poolJson = require("../../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const bPoolJson = require("../../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json");
const reserveJson = require("../../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json");
const redeemableTokenJson = require("../../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json");
const crpJson = require("../../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json");

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

describe("Trust", async function () {
  it("should burn token dust when closing pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
    const crp = new ethers.Contract(
      await pool.crp(),
      crpJson.abi,
      creator
    ) as ConfigurableRightsPool;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      bPoolJson.abi,
      creator
    ) as BPool;

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
      await reserve.transfer(signers[3].address, 0);
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

  it("should correctly end raise if redeemInit set to 0 after successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
    const crp = new ethers.Contract(
      await pool.crp(),
      crpJson.abi,
      creator
    ) as ConfigurableRightsPool;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      bPoolJson.abi,
      creator
    ) as BPool;

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

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);

    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 0);
    }

    await trust.anonEndDistribution();
  });

  it("should calculate weights correctly when no trading occurs", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder must transfer funds to pool
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

    const startBlock = await ethers.provider.getBlockNumber();

    const actualInitialSpotPriceSansFee = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    const actualInitialValuation = actualInitialSpotPriceSansFee
      .mul(await token.totalSupply())
      .div(Util.ONE);

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 0);
    }

    await crp.pokeWeights();

    const actualFinalSpotPriceSansFee = await bPool.getSpotPriceSansFee(
      reserve.address,
      token.address
    );
    const actualFinalValuation = actualFinalSpotPriceSansFee
      .mul(await token.totalSupply())
      .div(Util.ONE);

    await trust.anonEndDistribution();

    assert(
      actualInitialValuation.eq(initialValuation),
      `wrong initial valuation
    expected  ${initialValuation}
    got       ${actualInitialValuation}`
    );

    assert(
      actualFinalValuation.eq(finalValuation),
      `wrong final valuation
    expected  ${finalValuation}
    got       ${actualFinalValuation}`
    );
  });

  it("should succeed if minimum raise hit exactly (i.e. dust left in pool doesn't cause issues)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
      signers[1]
    ) as ReserveToken;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

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

    const bPoolBalance = await reserve.balanceOf(bPool.address);

    const swapUnits = 4;

    for (let i = 0; i < swapUnits; i++) {
      await swapReserveForTokens(
        signer1,
        successLevel
          .sub(bPoolBalance)
          .mul(Util.ONE)
          .div(swapUnits)
          .div(Util.ONE)
      );

      console.log(`bPool balance  ${await reserve.balanceOf(bPool.address)}`);
    }

    const finalBPoolBalance = await reserve.balanceOf(bPool.address);

    assert(
      finalBPoolBalance.eq(successLevel),
      `pool balance not exactly equal to success level (important for this test)
    finalBPoolBalance ${finalBPoolBalance}
    successLevel      ${successLevel}`
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 0);
    }

    await trust.anonEndDistribution();

    const bPoolDust = finalBPoolBalance.mul(Util.ONE).div(1e7).div(Util.ONE);

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `raise should have succeeded when hitting minimum raise exactly
    finalBPoolBalance ${finalBPoolBalance}
    successLevel      ${successLevel}
    bPoolDust         ${bPoolDust}`
    );
  });

  it("should set next phase when raise end has been triggered", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    assert(
      (await token.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await token.currentPhase()}`
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    assert(
      (await token.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await token.currentPhase()}`
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 1);
    }

    assert(
      (await token.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await token.currentPhase()}`
    );

    await trust.anonEndDistribution();

    assert(
      (await token.currentPhase()) === Phase.ONE,
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );
  });

  it("should add reserve init to pool balance after raise begins", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    assert(
      !(await pool.reserveInit()).isZero(),
      "reserveInit variable was zero on pool construction"
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    let [crp2, bPool2] = await Util.poolContracts(signers, pool);

    assert(
      (await reserve.balanceOf(seeder.address)).isZero(),
      "seeder did not transfer reserve init during raise start"
    );

    // trading pool reserve balance must be non-zero after raise start
    const bPoolReserveBalance = await reserve.balanceOf(bPool2.address);
    assert(
      bPoolReserveBalance.eq(reserveInit),
      `wrong reserve amount in pool when raise started
    pool reserve    ${await reserve.balanceOf(pool.address)}
    bPool reserve   ${bPoolReserveBalance}
    reserve init    ${reserveInit}`
    );
  });

  it("should allow third party to deploy trust, independently of creator and seeder, with its configuration publicly accessible", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
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

    assert((await trust.creator()) === creator.address, "wrong creator");
    assert((await trust.seeder()) === seeder.address, "wrong seeder");
    assert(
      (await trust.minimumCreatorRaise()).eq(minimumCreatorRaise),
      "wrong minimum raise amount"
    );
    assert((await trust.seederFee()).eq(seederFee), "wrong seeder fee");
    assert(
      (await trust.minimumTradingDuration()).eq(minimumTradingDuration),
      "wrong raise duration"
    );
    assert((await trust.redeemInit()).eq(redeemInit), "wrong redeem init");
    assert((await trust.seederUnits()) === seederUnits, "wrong seeder units");
    assert(
      (await trust.seederCooldownDuration()) === seederCooldownDuration,
      "wrong seeder cooldown duration"
    );
    assert(
      ethers.utils.isAddress(await trust.seedERC20Factory()),
      `seedERC20Factory address was wrong, got ${await trust.seedERC20Factory()}`
    );

    // using TrustConfig accessor
    const trustConfig = await trust.getTrustConfig();

    assert(
      trustConfig.creator === creator.address,
      "wrong getTrustConfig creator"
    );
    assert(
      trustConfig.seeder === seeder.address,
      "wrong getTrustConfig seeder"
    );
    assert(
      trustConfig.minimumCreatorRaise.eq(minimumCreatorRaise),
      "wrong getTrustConfig minimum raise amount"
    );
    assert(
      trustConfig.seederFee.eq(seederFee),
      "wrong getTrustConfig seeder fee"
    );
    assert(
      trustConfig.minimumTradingDuration.eq(minimumTradingDuration),
      "wrong getTrustConfig raise duration"
    );
    assert(
      trustConfig.redeemInit.eq(redeemInit),
      "wrong getTrustConfig redeem init"
    );
    assert(
      trustConfig.seederUnits === seederUnits,
      "wrong getTrustConfig seeder units"
    );
    assert(
      trustConfig.seederCooldownDuration === seederCooldownDuration,
      "wrong getTrustConfig seeder cooldown duration"
    );
    assert(
      ethers.utils.isAddress(trustConfig.seedERC20Factory),
      `seedERC20Factory address was wrong, got ${trustConfig.seedERC20Factory}`
    );
  });

  it("should set correct phases for token and pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // seeder is not creator/owner
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
      signers[1]
    ) as ReserveToken;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // current pool phase should be ZERO
    assert(
      (await pool.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await pool.currentPhase()}`
    );

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    // pool phase ONE block should be set
    assert(
      (await pool.phaseBlocks(0)) === startBlock,
      `wrong startBlock
      expected  ${startBlock}
      got       ${await pool.phaseBlocks(0)}
      `
    );

    // pool phase TWO block should be set
    assert(
      (await pool.phaseBlocks(1)) === startBlock + minimumTradingDuration + 1,
      `wrong pool phase TWO block
      expected  ${startBlock + minimumTradingDuration + 1}
      got       ${await pool.phaseBlocks(1)}
      `
    );

    // current pool phase should be ONE, as trading is in progress
    assert(
      (await pool.currentPhase()) === Phase.ONE,
      `expected phase ${Phase.ONE} but got ${await pool.currentPhase()}`
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[2].address, 1);
    }

    // current pool phase should be TWO, as it is 1 block after trading ended
    assert(
      (await pool.currentPhase()) === Phase.TWO,
      `expected phase ${Phase.TWO} but got ${await pool.currentPhase()}`
    );

    // token phase should still be ZERO
    // if it is, a user may accidentally redeem before raise ended, hence redeeming will return zero reserve to the user
    assert(
      (await token.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await token.currentPhase()}`
    );

    await trust.anonEndDistribution();

    // token should be in phase ONE
    assert(
      (await token.currentPhase()) === Phase.ONE,
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );

    // current pool phase should be THREE, as raise has ended
    assert(
      (await pool.currentPhase()) === Phase.THREE,
      `expected phase ${Phase.THREE} but got ${await pool.currentPhase()}`
    );
  });

  it("should allow anyone to start raise when seeder has transferred sufficient reserve liquidity", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    // seeder transfers insufficient reserve liquidity
    await reserveSeeder.transfer(await trust.pool(), reserveInit.sub(1));

    // 'anyone'
    const trust2 = new ethers.Contract(
      trust.address,
      trustJson.abi,
      signers[2]
    ) as Trust;

    await Util.assertError(
      async () => await trust2.anonStartDistribution({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds balance",
      "raise wrongly started by someone with insufficent seed reserve liquidity"
    );

    // seeder approves sufficient reserve liquidity
    await reserveSeeder.transfer(await trust.pool(), 1);

    // anyone can start distribution
    await trust2.anonStartDistribution({ gasLimit: 100000000 });
  });

  it("should only allow trust endRaise to succeed after pool trading ended", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    // creator attempts to immediately end raise
    await Util.assertError(
      async () => await trust.anonEndDistribution(),
      "revert BAD_PHASE",
      "creator ended raise before pool trading ended"
    );

    const trust2 = new ethers.Contract(
      trust.address,
      trustJson.abi,
      signers[2]
    ) as Trust;

    // other user attempts to immediately end raise
    await Util.assertError(
      async () => await trust2.anonEndDistribution(),
      "revert BAD_PHASE",
      "other user ended raise before pool trading ended"
    );
  });

  it("should allow only token admin and creator to set redeemables", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve2 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve3 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve4 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve5 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve6 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve7 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve8 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve9 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
    const signer2 = signers[4];
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    // creator can add redeemable via proxy method on trust contract
    await token.addRedeemable(reserve2.address);

    // non-creator cannot add redeemable
    await Util.assertError(
      async () => await token.connect(signer1).addRedeemable(reserve3.address),
      "revert ONLY_REDEEMABLE_ADDER",
      "non-creator added redeemable"
    );

    // adding same redeemable should revert
    await Util.assertError(
      async () => await token.addRedeemable(reserve2.address),
      "revert DUPLICATE_REDEEMABLE",
      "added redeemable that was previously added"
    );

    // can add up to 8 redeemables
    await token.addRedeemable(reserve3.address);
    await token.addRedeemable(reserve4.address);
    await token.addRedeemable(reserve5.address);
    await token.addRedeemable(reserve6.address);
    await token.addRedeemable(reserve7.address);
    await token.addRedeemable(reserve8.address);

    await Util.assertError(
      async () => await token.addRedeemable(reserve9.address),
      "revert MAX_REDEEMABLES",
      "number of added redeemables exceeds limit of 8"
    );
  });

  it("should allow only token admin (Trust) to set senders/receivers", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    // the trust renounces the admin role after deploying the redeemable token.
    assert(
      !(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), trust.address)),
      "trust did not renounce admin role"
    );

    // creator cannot add unfreezable
    await Util.assertError(
      async () =>
        await token.grantRole(await token.RECEIVER(), signers[3].address),
      "revert AccessControl: sender must be an admin to grant",
      "creator added receiver, despite not being token admin"
    );

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;

    // non-creator cannot add unfreezable, (no one but admin can add receiver)
    await Util.assertError(
      async () =>
        await token1.grantRole(await token.RECEIVER(), signers[3].address),
      "revert AccessControl: sender must be an admin to grant",
      "anon added receiver, despite not being token admin"
    );
  });

  it("should correctly calculate duration of pool, denominated in blocks from the block that seed funds are claimed", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const blockBeforeRaiseSetup = await ethers.provider.getBlockNumber();
    const expectedPhaseBlock = blockBeforeRaiseSetup + minimumTradingDuration;
    let blockCount = 0;

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const blockAfterRaiseSetup = await ethers.provider.getBlockNumber();
    const blocksDuringRaiseSetup = blockAfterRaiseSetup - blockBeforeRaiseSetup;

    blockCount += blocksDuringRaiseSetup; // 1

    // move some blocks around
    while ((await ethers.provider.getBlockNumber()) !== expectedPhaseBlock) {
      await reserve.transfer(signers[2].address, 1);
      blockCount++;
    }

    assert(
      minimumTradingDuration === blockCount,
      `wrong raise duration, expected ${minimumTradingDuration} got ${blockCount}`
    );
  });

  it("should transfer correct value to all stakeholders after successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const signer1 = signers[2];
    const signer2 = signers[3];

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
      signers[1]
    ) as ReserveToken;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // give holders some reserve
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users hit the minimum raise

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;
    const reserve1 = reserve.connect(signer1);

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

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

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

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

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;
    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[3]
    ) as RedeemableERC20;

    // redeem all
    await token1.redeem(signer1EndingTokenBalance);

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
    await token2.redeem(signer2EndingTokenBalance.sub(smallTokenAmount));

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

  it("should transfer correct value to all stakeholders after failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const signer1 = signers[2];
    const signer2 = signers[3];

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("10000" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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
    const seederStartingReserveBalance = await reserve.balanceOf(
      seeder.address
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // give holders some reserve (not enough for successful raise)
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users FAIL to hit the minimum raise

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);
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

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

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

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;
    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[3]
    ) as RedeemableERC20;

    // redeem all
    await token1.redeem(signer1EndingTokenBalance);

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
    await token2.redeem(signer2EndingTokenBalance.sub(smallTokenAmount));

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

  it("should move all seeder funds to the pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      await reserve.balanceOf(signers[0].address)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    const seederReserveBeforeStart = await reserve.balanceOf(seeder.address);

    await Util.assertError(
      async () => await trust.anonStartDistribution({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds balance",
      "initiated raise before seeder transferred reserve token"
    );

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const seederReserveAfterStart = await reserve.balanceOf(seeder.address);

    assert(
      seederReserveBeforeStart.sub(seederReserveAfterStart).eq(reserveInit),
      `wrong reserve amount moved to pool ${seederReserveBeforeStart} ${seederReserveAfterStart}`
    );
  });

  it("should be able to exit trust if creator does not end raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      await reserve.balanceOf(signers[0].address)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });

    const startBlock = await ethers.provider.getBlockNumber();

    const trust2 = new ethers.Contract(
      trust.address,
      trust.interface,
      signer1
    ) as Trust;
    // some other signer triggers trust to exit before phase change, should fail
    await Util.assertError(
      async () => await trust2.anonEndDistribution(),
      "revert BAD_PHASE",
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

  it("should NOT refund successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1];
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    await reserve.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // users hit the minimum raise
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

    const bPool1 = bPool.connect(signer1);
    const reserve1 = reserve.connect(signer1);

    const crp1 = new ethers.Contract(
      await trustPool.crp(),
      crpJson.abi,
      signer1
    ) as ConfigurableRightsPool;

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights();
      await reserve1.approve(bPool1.address, spend1);
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
      i++;
    }

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

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signer1.address, 1);
    }

    const seederBefore = await reserve.balanceOf(seeder.address);
    await trust.anonEndDistribution();
    const dust = await reserve.balanceOf(bPool.address);
    const seederAfter = await reserve.balanceOf(seeder.address);
    const seederDiff = seederAfter.sub(seederBefore);
    // Seeder loses dust here.
    const expectedSeederDiff = ethers.BigNumber.from("2100000000").sub(
      Util.determineReserveDust(dust)
    );

    assert(
      expectedSeederDiff.eq(seederDiff),
      `wrong seeder diff
      ${expectedSeederDiff} ${seederDiff}`
    );

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signer1
    ) as RedeemableERC20;
    await token1.redeem(await token1.balanceOf(signer1.address));
    const reserveBalance1 = await reserve.balanceOf(signer1.address);
    const expectedBalance1 = "1829853948";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong balance 1 after redemption: ${reserveBalance1} ${expectedBalance1}`
    );

    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signer2
    ) as RedeemableERC20;
    await token2.redeem(await token2.balanceOf(signer2.address));
    const reserveBalance2 = await reserve.balanceOf(signer2.address);
    const expectedBalance2 = "170146068";
    assert(
      ethers.BigNumber.from(expectedBalance2).eq(reserveBalance2),
      `wrong balance 2 after redemption: ${reserveBalance2} ${expectedBalance2}`
    );
  });

  it("should refund users", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100000" + Util.sixZeros);
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
    const signer2 = signers[4];
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    await reserve.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
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

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

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
      redeemableTokenJson.abi,
      signer1
    ) as RedeemableERC20;
    await token1.redeem(await token1.balanceOf(signer1.address));
    const reserveBalance1 = await reserve.balanceOf(signer1.address);
    const expectedBalance1 = "841344575";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong balance 1 after redemption: ${reserveBalance1} ${expectedBalance1}`
    );

    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signer2
    ) as RedeemableERC20;
    await token2.redeem(await token1.balanceOf(signer2.address));
    const reserveBalance2 = await reserve.balanceOf(signer2.address);
    const expectedBalance2 = "2158655434";
    assert(
      ethers.BigNumber.from(expectedBalance2).eq(reserveBalance2),
      `wrong balance 2 after redemption: ${reserveBalance2} ${expectedBalance2}`
    );
  });

  it("should create tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(
      rightsManager,
      crpFactory,
      bFactory
    );

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("0");
    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("0");
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
        minimumTradingDuration,
        redeemInit,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        tier: tier.address,
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

    await reserve.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[1].address, 1);
    }

    await trust.anonEndDistribution();
  });
});
