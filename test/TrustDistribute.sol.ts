import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust";
import type { ReserveToken } from "../typechain/ReserveToken";
import * as Util from "./Util";
import { utils } from "ethers";
import type { Prestige } from "../typechain/Prestige";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";

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

enum RaiseStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

describe("TrustDistribute", async function () {
  describe("should update raise status correctly", async function () {
    it("on successful raise", async function () {
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

      const trustFactory = await ethers.getContractFactory("Trust", {
        libraries: {
          RightsManager: rightsManager.address,
        },
      });

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const initialValuation = ethers.BigNumber.from(
        "10000" + Util.eighteenZeros
      );
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederUnits = 0;
      const unseedDelay = 0;

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const hodler1 = signers[3];

      const successLevel = redeemInit
        .add(minCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const raiseDuration = 50;

      const trustFactoryDeployer = new ethers.ContractFactory(
        trustFactory.interface,
        trustFactory.bytecode,
        deployer
      );

      const trust = await trustFactoryDeployer.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seeder.address,
          seederFee,
          seederUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
        },
        redeemInit
      );

      await trust.deployed();

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.PENDING,
        `raise status not pending`
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      );

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.SEEDED,
        `raise status not seeded`
      );

      await trust.anonStartRaise({ gasLimit: 100000000 });

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.TRADING,
        `raise status not trading`
      );

      const startBlock = await ethers.provider.getBlockNumber();

      const token = new ethers.Contract(
        trust.token(),
        redeemableTokenJson.abi,
        creator
      );
      const pool = new ethers.Contract(
        trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;

      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (hodler, spend) => {
        // give hodler some reserve
        await reserve.transfer(hodler.address, spend);

        const reserveHodler = reserve.connect(hodler);
        const crpHodler = crp.connect(hodler);
        const bPoolHodler = bPool.connect(hodler);

        await crpHodler.pokeWeights();
        await reserveHodler.approve(bPool.address, spend);
        await bPoolHodler.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.eighteenZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(hodler1, reserveSpend);
      }

      // create empty transfer blocks until reaching unblock block, so raise can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + raiseDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.TRADINGCANEND,
        `raise status not trading can end`
      );

      await trust.anonEndRaise();

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.SUCCESS,
        "raise status not successful raise"
      );
    });

    it("on failed raise", async function () {
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

      const trustFactory = await ethers.getContractFactory("Trust", {
        libraries: {
          RightsManager: rightsManager.address,
        },
      });

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const initialValuation = ethers.BigNumber.from(
        "10000" + Util.eighteenZeros
      );
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederUnits = 0;
      const unseedDelay = 0;

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator

      const successLevel = redeemInit
        .add(minCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const raiseDuration = 50;

      const trustFactoryDeployer = new ethers.ContractFactory(
        trustFactory.interface,
        trustFactory.bytecode,
        deployer
      );

      const trust = await trustFactoryDeployer.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seeder.address,
          seederFee,
          seederUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
        },
        redeemInit
      );

      await trust.deployed();

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.PENDING,
        "raise status was not set to pending"
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      );

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.SEEDED,
        `raise status not set to seeded`
      );

      await trust.anonStartRaise({ gasLimit: 100000000 });

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.TRADING,
        "raise status was not set to trading"
      );

      const startBlock = await ethers.provider.getBlockNumber();

      // create empty transfer blocks until reaching unblock block, so raise can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + raiseDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.TRADINGCANEND,
        `raise status not trading can end`
      );

      await trust.anonEndRaise();

      assert(
        (await trust.getRaiseStatus()) === RaiseStatus.FAIL,
        "raise status was failed"
      );
    });
  });

  it("should burn all unsold tokens", async function () {
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

    const trustFactory = await ethers.getContractFactory("Trust", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "10000" + Util.eighteenZeros
    );
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const unseedDelay = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const successLevel = redeemInit
      .add(minCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const raiseDuration = 50;

    const trustFactoryDeployer = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = await trustFactoryDeployer.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        unseedDelay,
        raiseDuration,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation,
      },
      redeemInit
    );

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    );

    // seeder must transfer funds before pool can init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartRaise({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const token = new ethers.Contract(
      trust.token(),
      redeemableTokenJson.abi,
      creator
    );
    const pool = new ethers.Contract(
      trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const reserveSpend = successLevel.div(10);

    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend);

      const reserveHodler = reserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await crpHodler.pokeWeights();
      await reserveHodler.approve(bPool.address, spend);
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
    };

    // reach success level
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(hodler1, reserveSpend);
    }

    const swappedTokens = await token.balanceOf(hodler1.address);

    // create empty transfer blocks until reaching unblock block, so raise can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + raiseDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    const tokenBPoolBalanceBefore = await token.balanceOf(bPool.address);

    await trust.anonEndRaise();

    const totalSupply = await token.totalSupply();
    const tokenDust = tokenBPoolBalanceBefore
      .mul(Util.ONE)
      .div(1e7)
      .div(Util.ONE)
      .add(2); // rounding error

    assert(
      totalSupply.eq(swappedTokens.add(tokenDust)),
      `remaining supply of tokens was not equal to number that were sold plus dust
      actual    ${totalSupply}
      expected  ${swappedTokens.add(tokenDust)}
      swapped   ${swappedTokens}
      tokenDust ${tokenDust}
    `
    );
  });

  it("should exit with minimal reserve dust remaining", async () => {
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

    const trustFactory = await ethers.getContractFactory("Trust", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "10000" + Util.eighteenZeros
    );
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const unseedDelay = 0;

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator

    const successLevel = redeemInit
      .add(minCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const raiseDuration = 50;

    const trustFactoryDeployer = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = await trustFactoryDeployer.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        unseedDelay,
        raiseDuration,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation,
      },
      redeemInit
    );

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    );

    // seeder must transfer seed funds before pool can init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartRaise({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const pool = new ethers.Contract(
      trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    // create empty transfer blocks until reaching unblock block, so raise can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + raiseDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address);

    assert(
      bPoolReserveBeforeExit.eq(reserveInit),
      "wrong amount of reserve in balancer pool"
    );

    await trust.anonEndRaise();

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);

    const expectedDust = bPoolReserveBeforeExit
      .mul(Util.ONE)
      .div(1e7)
      .div(Util.ONE)
      .add(1);

    assert(
      bPoolReserveAfterExit.eq(expectedDust),
      `
      wrong dust amount
      expected  ${expectedDust}
      got       ${bPoolReserveAfterExit}
    `
    );
  });

  describe("should only pay out creator if minimum raise met", async function () {
    it("when minimum raise met", async function () {
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

      const trustFactory = await ethers.getContractFactory("Trust", {
        libraries: {
          RightsManager: rightsManager.address,
        },
      });

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const initialValuation = ethers.BigNumber.from(
        "10000" + Util.eighteenZeros
      );
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederUnits = 0;
      const unseedDelay = 0;

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const hodler1 = signers[3];

      const successLevel = redeemInit
        .add(minCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const raiseDuration = 50;

      const trustFactoryDeployer = new ethers.ContractFactory(
        trustFactory.interface,
        trustFactory.bytecode,
        deployer
      );

      const trust = await trustFactoryDeployer.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seeder.address,
          seederFee,
          seederUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
        },
        redeemInit
      );

      await trust.deployed();

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      );

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      await trust.anonStartRaise({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      const token = new ethers.Contract(
        trust.token(),
        redeemableTokenJson.abi,
        creator
      );
      const pool = new ethers.Contract(
        trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;
      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (hodler, spend) => {
        // give hodler some reserve
        await reserve.transfer(hodler.address, spend);

        const reserveHodler = reserve.connect(hodler);
        const crpHodler = crp.connect(hodler);
        const bPoolHodler = bPool.connect(hodler);

        await crpHodler.pokeWeights();
        await reserveHodler.approve(bPool.address, spend);
        await bPoolHodler.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.eighteenZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(hodler1, reserveSpend);
      }

      // create empty transfer blocks until reaching unblock block, so raise can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + raiseDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      const creatorBalanceBefore = await reserve.balanceOf(creator.address);

      await trust.anonEndRaise();

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        !creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly did not receive payout after successful raise"
      );
    });

    it("when minimum raise not met", async function () {
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

      const trustFactory = await ethers.getContractFactory("Trust", {
        libraries: {
          RightsManager: rightsManager.address,
        },
      });

      const tokenName = "Token";
      const tokenSymbol = "TKN";

      const reserveInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
      const initialValuation = ethers.BigNumber.from(
        "10000" + Util.eighteenZeros
      );
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minCreatorRaise = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
      const seederUnits = 0;
      const unseedDelay = 0;

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const hodler1 = signers[3];

      const successLevel = redeemInit
        .add(minCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const raiseDuration = 50;

      const trustFactoryDeployer = new ethers.ContractFactory(
        trustFactory.interface,
        trustFactory.bytecode,
        deployer
      );

      const trust = await trustFactoryDeployer.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seeder.address,
          seederFee,
          seederUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
        },
        redeemInit
      );

      await trust.deployed();

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      );

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      await trust.anonStartRaise({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      const token = new ethers.Contract(
        trust.token(),
        redeemableTokenJson.abi,
        creator
      );
      const pool = new ethers.Contract(
        trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;
      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (hodler, spend) => {
        // give hodler some reserve
        await reserve.transfer(hodler.address, spend);

        const reserveHodler = reserve.connect(hodler);
        const crpHodler = crp.connect(hodler);
        const bPoolHodler = bPool.connect(hodler);

        await crpHodler.pokeWeights();
        await reserveHodler.approve(bPool.address, spend);
        await bPoolHodler.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.eighteenZeros)
        );
      };

      // failed to reach success level
      // while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(hodler1, reserveSpend);
      // }

      // create empty transfer blocks until reaching unblock block, so raise can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + raiseDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      const creatorBalanceBefore = await reserve.balanceOf(creator.address);

      await trust.anonEndRaise();

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly received payout after failed raise"
      );
    });
  });
});
