import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust";
import type { ReserveToken } from "../typechain/ReserveToken";
import * as Util from "./Util";
import { utils } from "ethers";
import type { BigNumber } from "ethers";
import type { Prestige } from "../typechain/Prestige";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import { max_uint32 } from "./Util";
import type { RedeemableERC20 } from "../typechain/RedeemableERC20";
import type { ConfigurableRightsPool } from "../typechain/ConfigurableRightsPool";
import type { SeedERC20 } from "../typechain/SeedERC20";

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

interface DistributionProgress {
  distributionStatus: DistributionStatus;
  distributionStartBlock: number;
  distributionEndBlock: number;
  poolReserveBalance: BigNumber;
  poolTokenBalance: BigNumber;
  reserveInit: BigNumber;
  minimumCreatorRaise: BigNumber;
  seederFee: BigNumber;
  redeemInit: BigNumber;
}

interface TrustContracts {
  reserveERC20: string;
  redeemableERC20: string;
  redeemableERC20Pool: string;
  seeder: string;
  prestige: string;
  crp: string;
  pool: string;
}

describe("Trust", async function () {
  it("should correctly end raise if redeemInit set to 0 after successful raise", async function () {
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
    const redeemInit = ethers.BigNumber.from("0" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

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
    );

    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend);

      const reserveHodler = reserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await reserveHodler.approve(bPool.address, spend);
      await crpHodler.pokeWeights();
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
    };

    const spend = ethers.BigNumber.from("250" + Util.eighteenZeros);

    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(hodler1, spend);
    }

    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 0);
    }

    await trust.anonEndDistribution();
  });

  it("should include correct values when calling getContracts", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const getContractsDeployed: TrustContracts = await trust.getContracts();

    const token = await trust.token();
    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    assert(
      getContractsDeployed.reserveERC20 === reserve.address,
      `wrong reserve contract address ${getContractsDeployed.reserveERC20} ${reserve.address}`
    );
    assert(
      getContractsDeployed.redeemableERC20 === token,
      `wrong token contract address ${getContractsDeployed.redeemableERC20} ${token}`
    );
    assert(
      getContractsDeployed.redeemableERC20Pool === pool.address,
      `wrong pool contract address ${getContractsDeployed.redeemableERC20Pool} ${pool.address}`
    );
    assert(
      getContractsDeployed.seeder === seeder.address,
      `wrong seeder address ${getContractsDeployed.seeder} ${seeder.address}`
    );
    assert(
      getContractsDeployed.prestige === prestige.address,
      `wrong prestige address ${getContractsDeployed.prestige} ${prestige.address}`
    );
    assert(
      getContractsDeployed.crp === crp.address,
      `wrong configurable rights pool address ${getContractsDeployed.crp} ${crp.address}`
    );
    assert(
      getContractsDeployed.pool === Util.zeroAddress,
      `balancer pool should not be defined yet ${getContractsDeployed.pool} ${Util.zeroAddress}`
    );

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

    let [crp2, bPool2] = await Util.poolContracts(signers, pool);

    const getContractsTrading = (await trust.getContracts()) as TrustContracts;

    assert(
      getContractsTrading.pool === bPool2.address,
      `wrong balancer pool address ${getContractsTrading.pool} ${bPool2.address}`
    );
  });

  it("should calculate weights correctly when no trading occurs", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation,
      }
    )) as Trust;

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

  it("should error if totalTokenSupply is zero", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("0" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    await Util.assertError(
      async () =>
        (await trustFactory1.deploy(
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel,
          }
        )) as Trust,
      "revert MIN_TOKEN_SUPPLY",
      "setting totalTokenSupply to zero did not error"
    );
  });

  it("should error if reserveInit is zero", async function () {
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

    const reserveInit = ethers.BigNumber.from("0" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    await Util.assertError(
      async () =>
        (await trustFactory1.deploy(
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel,
          }
        )) as Trust,
      "revert RESERVE_INIT_MINIMUM",
      "setting reserveInit to zero did not error"
    );
  });

  it("should allow redeemInit to be zero", async function () {
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
    const redeemInit = ethers.BigNumber.from("0" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    // a redeemInit value of zero causes division by zero in following pool calculation
    // i.e. _tokenWeightFinal = _targetSpotFinal / redeemInit
    (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;
  });

  it("should include correct values when calling getDistributionProgress", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const distributionProgressDeployed: DistributionProgress =
      await trust.getDistributionProgress();

    assert(
      distributionProgressDeployed.distributionStatus ===
        DistributionStatus.PENDING,
      `did not get correct value for DistributionProgress.distributionStatus on deploy
      expected  ${DistributionStatus.PENDING}
      got       ${distributionProgressDeployed.distributionStatus}
      `
    );

    assert(
      max_uint32.eq(distributionProgressDeployed.distributionStartBlock),
      `did not get correct value for DistributionProgress.distributionStartBlock on deploy
    expected  ${max_uint32}
    got       ${distributionProgressDeployed.distributionStartBlock}
    `
    );

    assert(
      max_uint32.eq(distributionProgressDeployed.distributionEndBlock),
      `did not get correct value for DistributionProgress.distributionEndBlock on deploy
    expected  ${max_uint32}
    got       ${distributionProgressDeployed.distributionEndBlock}
    `
    );

    assert(
      distributionProgressDeployed.poolReserveBalance.isZero(),
      `did not get correct value for poolReserveBalance on deploy
    expected  ${0}
    got       ${distributionProgressDeployed.poolReserveBalance}
    `
    );

    assert(
      distributionProgressDeployed.poolTokenBalance.isZero(),
      `did not get correct value for poolTokenBalance on deploy
    expected  ${0}
    got       ${distributionProgressDeployed.poolTokenBalance}
    `
    );

    assert(
      distributionProgressDeployed.reserveInit.eq(reserveInit),
      `did not get correct value for reserveInit on deploy
    expected  ${reserveInit}
    got       ${distributionProgressDeployed.reserveInit}
    `
    );

    assert(
      distributionProgressDeployed.minimumCreatorRaise.eq(minimumCreatorRaise),
      `did not get correct value for minimumCreatorRaise on deploy
    expected  ${minimumCreatorRaise}
    got       ${distributionProgressDeployed.minimumCreatorRaise}
    `
    );

    assert(
      distributionProgressDeployed.seederFee.eq(seederFee),
      `did not get correct value for seederFee on deploy
    expected  ${seederFee}
    got       ${distributionProgressDeployed.seederFee}
    `
    );

    assert(
      distributionProgressDeployed.redeemInit.eq(redeemInit),
      `did not get correct value for redeemInit on deploy
    expected  ${redeemInit}
    got       ${distributionProgressDeployed.redeemInit}
    `
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const raiseProgressSeeded: DistributionProgress =
      await trust.getDistributionProgress();

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    assert(
      raiseProgressSeeded.distributionStatus === DistributionStatus.SEEDED,
      `did not get correct value for DistributionProgress.distributionStatus on seeding pool
    expected  ${DistributionStatus.SEEDED}
    got       ${raiseProgressSeeded.distributionStatus}
    `
    );

    assert(
      max_uint32.eq(distributionProgressDeployed.distributionStartBlock),
      `did not get correct value for DistributionProgress.distributionStartBlock on seeding pool
    expected  ${max_uint32}
    got       ${distributionProgressDeployed.distributionStartBlock}
    `
    );

    assert(
      max_uint32.eq(distributionProgressDeployed.distributionEndBlock),
      `did not get correct value for DistributionProgress.distributionEndBlock on seeding pool
    expected  ${max_uint32}
    got       ${distributionProgressDeployed.distributionEndBlock}
    `
    );

    // poolReserveBalance is actually the bPool balance, but bPool doesn't exist
    // since raise hasn't started yet, this value is actually zero
    assert(raiseProgressSeeded.poolReserveBalance.isZero());

    assert(
      raiseProgressSeeded.poolTokenBalance.isZero(),
      `did not get correct value for poolTokenBalance on seeding pool
    expected  ${0} (token not constructed yet)
    got       ${raiseProgressSeeded.poolTokenBalance}
    `
    );

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const distributionProgressTrading: DistributionProgress =
      await trust.getDistributionProgress();

    const distributionStartBlock = await ethers.provider.getBlockNumber();
    const distributionEndBlock =
      distributionStartBlock + minimumTradingDuration + 1;

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20;

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    assert(
      distributionProgressTrading.distributionStatus ===
        DistributionStatus.TRADING,
      `did not get correct value for DistributionProgress.distributionStatus on starting raise
    expected  ${DistributionStatus.TRADING}
    got       ${distributionProgressTrading.distributionStatus}
    `
    );

    assert(
      distributionStartBlock ===
        distributionProgressTrading.distributionStartBlock,
      `did not get correct value for DistributionProgress.distributionStartBlock on starting raise
    expected  ${distributionStartBlock}
    got       ${distributionProgressTrading.distributionStartBlock}
    `
    );

    assert(
      distributionEndBlock === distributionProgressTrading.distributionEndBlock,
      `did not get correct value for DistributionProgress.distributionEndBlock on starting raise
    expected  ${distributionEndBlock}
    got       ${distributionProgressTrading.distributionEndBlock}
    `
    );

    assert(
      distributionProgressTrading.poolReserveBalance.eq(reserveInit),
      `did not get correct value for poolReserveBalance on starting raise
    expected  ${reserveInit}
    got       ${distributionProgressTrading.poolReserveBalance}
    `
    );

    assert(
      distributionProgressTrading.poolTokenBalance.eq(
        await token.balanceOf(bPool.address)
      ),
      `did not get correct value for poolTokenBalance on starting raise
    expected    ${await token.balanceOf(bPool.address)}
    got         ${distributionProgressTrading.poolTokenBalance}
    `
    );
    assert(distributionProgressTrading.poolTokenBalance.eq(totalTokenSupply));

    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend);

      const reserveHodler = reserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await reserveHodler.approve(bPool.address, spend);
      await crpHodler.pokeWeights();
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
    };

    const spend = ethers.BigNumber.from("10" + Util.eighteenZeros);

    await swapReserveForTokens(hodler1, spend);

    const distributionProgressSwap: DistributionProgress =
      await trust.getDistributionProgress();

    assert(
      distributionProgressSwap.distributionStatus ===
        DistributionStatus.TRADING,
      `did not get correct value for DistributionProgress.distributionStatus after a swap
    expected  ${DistributionStatus.TRADING}
    got       ${distributionProgressSwap.distributionStatus}
    `
    );

    assert(
      distributionStartBlock ===
        distributionProgressSwap.distributionStartBlock,
      `did not get correct value for DistributionProgress.distributionStartBlock after a swap
    expected  ${distributionStartBlock}
    got       ${distributionProgressSwap.distributionStartBlock}
    `
    );

    assert(
      distributionEndBlock === distributionProgressSwap.distributionEndBlock,
      `did not get correct value for DistributionProgress.distributionEndBlock after a swap
    expected  ${distributionEndBlock}
    got       ${distributionProgressSwap.distributionEndBlock}
    `
    );

    assert(
      distributionProgressSwap.poolReserveBalance.eq(reserveInit.add(spend)),
      `did not get correct value for poolReserveBalance after a swap
    expected  ${reserveInit.add(spend)}
    got       ${distributionProgressSwap.poolReserveBalance}
    `
    );

    assert(
      distributionProgressSwap.poolTokenBalance.eq(
        await token.balanceOf(bPool.address)
      ),
      `did not get correct value for poolTokenBalance after a swap
    expected    ${await token.balanceOf(bPool.address)}
    got         ${distributionProgressSwap.poolTokenBalance}
    `
    );
    assert(distributionProgressSwap.poolTokenBalance.lt(totalTokenSupply));
  });

  it("should succeed if minimum raise hit exactly (i.e. dust left in pool doesn't cause issues)", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const hodler1 = signers[3];

    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

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

    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend);

      const reserveHodler = reserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await reserveHodler.approve(bPool.address, spend);
      await crpHodler.pokeWeights();
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
    };

    const bPoolBalance = await reserve.balanceOf(bPool.address);

    const swapUnits = 4;

    for (let i = 0; i < swapUnits; i++) {
      await swapReserveForTokens(
        hodler1,
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

  it("should return raise success balance", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
      {
        creator,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const successBalance = await trust.successBalance();

    assert(
      successLevel.eq(successBalance),
      `wrong success balance
    expected  ${successBalance}
    got       ${successBalance}`
    );
  });

  it("should set unblock block during only when raise end has been triggered", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
      {
        creator,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    assert(
      (await token.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await token.currentPhase()}`
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit);

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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
      {
        creator,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    assert(
      !(await pool.reserveInit()).isZero(),
      "reserveInit variable was zero on pool construction"
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit);

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
      (await reserve.balanceOf(seeder)).isZero(),
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

  it("should allow third party to deploy trust, independently of creator and seeder", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = new ethers.ContractFactory(
      trustFactory.interface,
      trustFactory.bytecode,
      deployer
    );

    const trust = (await trustFactory1.deploy(
      {
        creator,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const config = await trust.config();
    const contractRedeemInit = (await trust.config()).redeemInit;

    assert(config.creator === creator, "wrong creator");
    assert(config.seeder === seeder, "wrong seeder");
    assert(
      config.minimumCreatorRaise.eq(minimumCreatorRaise),
      "wrong minimum raise amount"
    );
    assert(config.seederFee.eq(seederFee), "wrong seeder fee");
    assert(
      config.minimumTradingDuration.eq(minimumTradingDuration),
      "wrong raise duration"
    );
    assert(contractRedeemInit.eq(redeemInit), "wrong redeem init");
  });

  it("should set correct phases for token and pool", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trust = (await trustFactory.deploy(
      {
        creator,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;
    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(seeder);

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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder,
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
    );

    await Util.assertError(
      async () => await trust2.anonStartDistribution({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds balance",
      "raise wrongly started by someone with insufficent seed reserve liquidity"
    );

    // seeder approves sufficient reserve liquidity
    await reserveSeeder.transfer(await trust.pool(), 1);

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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder,
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

  it("should configure prestige correctly", async function () {
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

    const trustFactory = await ethers.getContractFactory("Trust", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0]) as RedeemableERC20

    // assert(
    //   (await token.minimumPrestigeStatus()) === minimumStatus,
    //   "wrong prestige level set on token"
    // )
  });

  it("should mint the correct amount of tokens on construction", async function () {
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    assert(
      (await token.totalSupply()).eq(totalTokenSupply),
      "wrong amount of tokens minted"
    );
  });

  it("should set reserve asset as first redeemable asset on token construction", async function () {
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    assert(
      (await token.getRedeemables())[0] === reserve.address,
      "reserve asset not set as first redeemable"
    );

    await trust.creatorAddRedeemable(reserve2.address);

    assert(
      (await token.getRedeemables())[0] === reserve.address,
      "reserve asset no longer first redeemable, after adding 2nd redeemable"
    );

    assert(
      (await token.getRedeemables())[1] === reserve2.address,
      "2nd redeemable was not reserve 2 which was added after reserve 1"
    );
  });

  it("should allow only token owner and creator to set redeemables", async function () {
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // creator can add redeemable via proxy method on trust contract
    await trust.creatorAddRedeemable(reserve2.address);

    const trust2 = new ethers.Contract(
      trust.address,
      trustJson.abi,
      signers[2]
    );

    // non-creator cannot add redeemable
    await Util.assertError(
      async () => await trust2.creatorAddRedeemable(reserve3.address),
      "revert NOT_CREATOR",
      "non-creator added redeemable"
    );

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;
    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;

    // cannot add redeemables directly to token when trust is owner
    await Util.assertError(
      async () => await token.ownerAddRedeemable(reserve3.address),
      "revert Ownable: caller is not the owner",
      "creator added redeemable directly to token when trust was owner"
    );
    await Util.assertError(
      async () => await token2.ownerAddRedeemable(reserve3.address),
      "revert Ownable: caller is not the owner",
      "non-creator added redeemable directly to token when trust was owner"
    );

    // adding same redeemable should revert
    await Util.assertError(
      async () => await trust.creatorAddRedeemable(reserve2.address),
      "revert DUPLICATE_REDEEMABLE",
      "added redeemable that was previously added"
    );

    // can add up to 8 redeemables
    await trust.creatorAddRedeemable(reserve3.address);
    await trust.creatorAddRedeemable(reserve4.address);
    await trust.creatorAddRedeemable(reserve5.address);
    await trust.creatorAddRedeemable(reserve6.address);
    await trust.creatorAddRedeemable(reserve7.address);
    await trust.creatorAddRedeemable(reserve8.address);

    await Util.assertError(
      async () => await trust.creatorAddRedeemable(reserve9.address),
      "revert MAX_REDEEMABLES",
      "number of added redeemables exceeds limit of 8"
    );
  });

  it("should allow only token owner (Trust) to set unfreezables", async function () {
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("100");
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    // token owner is correct
    assert(
      (await token.owner()) === trust.address,
      "token owner is not correct"
    );

    // creator cannot add unfreezable
    await Util.assertError(
      async () => await token.ownerAddReceiver(signers[3].address),
      "revert Ownable: caller is not the owner",
      "creator added unfreezable, despite not being token owner"
    );

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;

    // non-creator cannot add unfreezable, (no one but owner can add unfreezables)
    await Util.assertError(
      async () => await token1.ownerAddReceiver(signers[3].address),
      "revert Ownable: caller is not the owner",
      "non-creator added unfreezable, despite not being token owner"
    );

    // creator cannot add unfreezable via some hypothetical proxy method on trust contract
    await Util.assertError(
      async () => await trust.creatorAddReceiver(signers[3].address),
      "TypeError: trust.creatorAddReceiver is not a function",
      "creator added unfreezable via trust proxy method"
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const blockBeforeRaiseSetup = await ethers.provider.getBlockNumber();
    const expectedUnblockBlock = blockBeforeRaiseSetup + minimumTradingDuration;
    let blockCount = 0;

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const blockAfterRaiseSetup = await ethers.provider.getBlockNumber();
    const blocksDuringRaiseSetup = blockAfterRaiseSetup - blockBeforeRaiseSetup;

    blockCount += blocksDuringRaiseSetup; // 1

    // move some blocks around
    while ((await ethers.provider.getBlockNumber()) !== expectedUnblockBlock) {
      await reserve.transfer(signers[2].address, 1);
      blockCount++;
    }

    assert(
      minimumTradingDuration === blockCount,
      `wrong raise duration, expected ${minimumTradingDuration} got ${blockCount}`
    );
  });

  it("should not initialize without seeder", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trustPromise = trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    ) as Promise<Trust>;

    await Util.assertError(
      async () => (await trustPromise) as Trust,
      "Error: invalid ENS name",
      "initialized without seeder"
    );
  });

  it("should transfer correct value to all stakeholders after successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const hodler1 = signers[2];
    const hodler2 = signers[3];

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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trust = (await trustFactory.deploy(
      {
        creator,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(seeder);

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
    const spend1 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    await reserve.transfer(hodler1.address, spend1.mul(10));
    await reserve.transfer(hodler2.address, spend2);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(creator);

    // BEGIN: users hit the minimum raise

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;
    const reserve1 = reserve.connect(hodler1);

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

    const crp1 = crp.connect(hodler1);
    const bPool1 = bPool.connect(hodler1);

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights(); // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1); // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"), // minimum out, otherwise revert
        ethers.BigNumber.from("1000000" + Util.eighteenZeros) // max price, otherwise revert
      );

      // ? do we need to check whether swap amounts are correct?

      i++;
    }

    const hodler1TokenBalance = await token.balanceOf(hodler1.address);

    // hodler 1 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(hodler1.address)).eq(0),
      "balancer pool not swapping correct spend1 amount in"
    );

    const crp2 = crp.connect(hodler2);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(hodler2);
    const reserve2 = reserve.connect(hodler2);
    await reserve2.approve(bPool2.address, spend2);

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.eighteenZeros)
    );

    const hodler2TokenBalance = await token.balanceOf(hodler2.address);

    // hodler 2 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(hodler2.address)).eq(0),
      "balancer pool not swapping correct spend2 amount in"
    );

    // END: users hit the minimum raise

    let countTransfersToTriggerUnblock = 0;
    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 1);
      countTransfersToTriggerUnblock++;
    }

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;

    const balancerPoolReserveBalance = await reserve.balanceOf(
      await bPool.address
    );

    assert(
      !balancerPoolReserveBalance.eq(0),
      `got zero reserve balance for pool/trust ${await bPool.address}`
    );

    const seederReserveBalanceBeforeEndRaise = await reserve.balanceOf(seeder);

    const finalBalance = await reserve.balanceOf(bPool.address);
    const tokenPay = redeemInit;

    await trust.anonEndDistribution();

    const poolDust = await reserve.balanceOf(bPool.address);
    const availableBalance = finalBalance.sub(poolDust);
    const seederPay = reserveInit.add(seederFee).sub(poolDust);

    const creatorEndingReserveBalance = await reserve.balanceOf(creator);
    const expectedCreatorEndingReserveBalance = creatorStartingReserveBalance
      .add(availableBalance)
      .sub(seederPay.add(tokenPay))
      .sub(countTransfersToTriggerUnblock); // creator loses some reserve when moving blocks

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
      ${countTransfersToTriggerUnblock} countTransfers
      `
    );

    // creator has no tokens
    assert(
      (await token.balanceOf(creator)).eq(0),
      "creator wrongly given tokens"
    );

    // Seeder has correct final balance

    // on successful raise, seeder gets reserve init + seeder fee
    const seederEndExpected = seederReserveBalanceBeforeEndRaise
      .add(reserveInit)
      .add(seederFee)
      .sub(poolDust);
    const seederEndActual = await reserve.balanceOf(seeder);

    assert(
      seederEndActual.eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after successful raise ended.
      Actual ${seederEndActual}
      Expected ${seederEndExpected}
      Difference ${seederEndActual.sub(seederEndExpected)}`
    );

    assert(
      (await token.balanceOf(seeder)).eq(0),
      "seeder wrongly given tokens"
    );

    // Token holders have correct final balance of reserve and tokens

    // correct reserve
    assert(
      (await reserve.balanceOf(hodler1.address)).eq(0),
      "hodler 1 wrongly given reserve when raise ended"
    );
    assert(
      (await reserve.balanceOf(hodler2.address)).eq(0),
      "hodler 2 wrongly given reserve when raise ended"
    );

    const hodler1EndingTokenBalance = await token.balanceOf(hodler1.address);
    const hodler2EndingTokenBalance = await token.balanceOf(hodler2.address);

    // Should remain unchanged from amounts during pool phase
    const hodler1ExpectedEndingTokenBalance = hodler1TokenBalance;
    const hodler2ExpectedEndingTokenBalance = hodler2TokenBalance;

    // correct tokens
    assert(
      hodler1EndingTokenBalance.eq(hodler1ExpectedEndingTokenBalance),
      "wrong final token balance for hodler 1"
    );
    assert(
      hodler2EndingTokenBalance.eq(hodler2ExpectedEndingTokenBalance),
      "wrong final token balance for hodler 2"
    );

    assert(
      (await token.totalSupply()).eq(
        hodler1EndingTokenBalance
          .add(hodler2EndingTokenBalance)
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
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${hodler1EndingTokenBalance}
      balanceOf hodler 2  ${hodler2EndingTokenBalance}
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
    await token1.senderRedeem(hodler1EndingTokenBalance);

    assert(
      (await token.totalSupply()).eq(
        hodler2EndingTokenBalance.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after hodler 1 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${await token.balanceOf(hodler1.address)}
      balanceOf hodler 2  ${await token.balanceOf(hodler2.address)}
      `
    );

    const smallTokenAmount = ethers.BigNumber.from("1" + Util.eighteenZeros);

    // redeem almost all tokens
    await token2.senderRedeem(hodler2EndingTokenBalance.sub(smallTokenAmount));

    assert(
      (await token.totalSupply()).eq(
        smallTokenAmount.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after hodler 2 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${await token.balanceOf(hodler1.address)}
      balanceOf hodler 2  ${await token.balanceOf(hodler2.address)}
      `
    );
  });

  it("should transfer correct value to all stakeholders after failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const hodler1 = signers[2];
    const hodler2 = signers[3];

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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "10000" + Util.eighteenZeros
    );
    const creator = signers[0].address;
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trust = (await trustFactory.deploy(
      {
        creator,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(seeder);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    // give holders some reserve (not enough for successful raise)
    const spend1 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    await reserve.transfer(hodler1.address, spend1.mul(10));
    await reserve.transfer(hodler2.address, spend2);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(creator);

    // BEGIN: users FAIL to hit the minimum raise

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    ) as RedeemableERC20;

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);
    const reserve1 = reserve.connect(hodler1);

    const crp1 = crp.connect(hodler1);
    const bPool1 = bPool.connect(hodler1);

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights(); // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1); // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"), // minimum out, otherwise revert
        ethers.BigNumber.from("1000000" + Util.eighteenZeros) // max price, otherwise revert
      );
      i++;
    }

    const hodler1TokenBalance = await token.balanceOf(hodler1.address);

    // hodler 1 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(hodler1.address)).eq(0),
      "balancer pool not swapping correct spend1 amount in"
    );

    const crp2 = crp.connect(hodler2);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(hodler2);
    const reserve2 = reserve.connect(hodler2);
    await reserve2.approve(bPool2.address, spend2);

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.eighteenZeros)
    );

    const hodler2TokenBalance = await token.balanceOf(hodler2.address);

    // hodler 2 transferred all reserve to token contract
    assert(
      (await reserve.balanceOf(hodler2.address)).eq(0),
      "balancer pool not swapping correct spend2 amount in"
    );

    // END: users hit the minimum raise

    let countTransfersToTriggerUnblock = 0;
    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 1);
      countTransfersToTriggerUnblock++;
    }

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
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

    const creatorEndingReserveBalance = await reserve.balanceOf(creator);

    // Creator has correct final balance

    // on failed raise, creator gets nothing
    assert(
      creatorEndingReserveBalance.eq(
        creatorStartingReserveBalance.sub(countTransfersToTriggerUnblock)
      ),
      `creator balance changed after failed raise
      ending balance ${creatorEndingReserveBalance}
      starting balance ${creatorStartingReserveBalance}
      countTransfers ${countTransfersToTriggerUnblock}
      expectedBalance ${creatorStartingReserveBalance.sub(
        countTransfersToTriggerUnblock
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
    const seederEndActual = await reserve.balanceOf(seeder);

    assert(
      seederEndActual.eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after failed raise ended ${seederEndActual} ${seederEndExpected}`
    );

    // Token holders have correct final balance of reserve and tokens

    // correct reserve
    assert(
      (await reserve.balanceOf(hodler1.address)).eq(0),
      "hodler 1 wrongly given reserve when raise ended"
    );
    assert(
      (await reserve.balanceOf(hodler2.address)).eq(0),
      "hodler 2 wrongly given reserve when raise ended"
    );

    const hodler1EndingTokenBalance = await token.balanceOf(hodler1.address);
    const hodler2EndingTokenBalance = await token.balanceOf(hodler2.address);

    // Should remain unchanged from amounts during pool phase
    const hodler1ExpectedEndingTokenBalance = hodler1TokenBalance;
    const hodler2ExpectedEndingTokenBalance = hodler2TokenBalance;

    // correct tokens
    assert(
      hodler1EndingTokenBalance.eq(hodler1ExpectedEndingTokenBalance),
      "wrong final token balance for hodler 1"
    );
    assert(
      hodler2EndingTokenBalance.eq(hodler2ExpectedEndingTokenBalance),
      "wrong final token balance for hodler 2"
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
        hodler1EndingTokenBalance
          .add(hodler2EndingTokenBalance)
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
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${hodler1EndingTokenBalance}
      balanceOf hodler 2  ${hodler2EndingTokenBalance}
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
    await token1.senderRedeem(hodler1EndingTokenBalance);

    assert(
      (await token.totalSupply()).eq(
        hodler2EndingTokenBalance.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after hodler 1 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${await token.balanceOf(hodler1.address)}
      balanceOf hodler 2  ${await token.balanceOf(hodler2.address)}
      `
    );

    const smallTokenAmount = ethers.BigNumber.from("1" + Util.eighteenZeros);

    // redeem almost all tokens
    await token2.senderRedeem(hodler2EndingTokenBalance.sub(smallTokenAmount));

    assert(
      (await token.totalSupply()).eq(
        smallTokenAmount.add(await token.balanceOf(bPool.address))
      ), // token dust
      `wrong total token supply after hodler 2 redemption
      initial supply      ${totalTokenSupply}
      total supply        ${await token.totalSupply()}
      balanceOf Address0  ${await token.balanceOf(ethers.constants.AddressZero)}
      balanceOf token     ${await token.balanceOf(token.address)}
      balanceOf pool      ${await token.balanceOf(pool.address)}
      balanceOf bPool     ${await token.balanceOf(bPool.address)}
      balanceOf trust     ${await token.balanceOf(trust.address)}
      balanceOf creator   ${await token.balanceOf(creator)}
      balanceOf seeder    ${await token.balanceOf(seeder)}
      balanceOf hodler 1  ${await token.balanceOf(hodler1.address)}
      balanceOf hodler 2  ${await token.balanceOf(hodler2.address)}
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(seeder, await reserve.balanceOf(signers[0].address));

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;

    const seederReserveBeforeStart = await reserve.balanceOf(seeder);

    await Util.assertError(
      async () => await trust.anonStartDistribution({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds balance",
      "initiated raise before seeder transferred reserve token"
    );

    // seeder must transfer before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const seederReserveAfterStart = await reserve.balanceOf(seeder);

    assert(
      seederReserveBeforeStart.sub(seederReserveAfterStart).eq(reserveInit),
      `wrong reserve amount moved to pool ${seederReserveBeforeStart} ${seederReserveAfterStart}`
    );
  });

  it("should create a token and immediately send all supply to the pool", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      }
    )) as Trust;

    await trust.deployed();

    const redeemableERC20 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[0]
    );

    assert((await redeemableERC20.balanceOf(trust.address)).eq(0));
    assert(
      (await redeemableERC20.balanceOf(await trust.pool())).eq(totalTokenSupply)
    );
  });

  it("should enforce final valuation greater than fundraise success", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        (await trustFactory.deploy(
          {
            creator: signers[0].address,
            minimumCreatorRaise: minimumCreatorRaise,
            seeder,
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel.sub(1),
          }
        )) as Trust,
      "revert MIN_FINAL_VALUATION",
      "did not enforce restriction that final valuation larger than success level"
    );
  });

  it("should enforce minted tokens to be greater than liquidity", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        (await trustFactory.deploy(
          {
            creator: signers[0].address,
            minimumCreatorRaise: minimumCreatorRaise,
            seeder,
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit: totalTokenSupply.add(1),
            initialValuation,
            finalValuation: redeemInit
              .add(minimumCreatorRaise)
              .add(seederFee)
              .add(reserveInit),
          }
        )) as Trust,
      "revert MIN_TOKEN_SUPPLY",
      "did not enforce restriction that minted tokens be greater than liquidity"
    );
  });

  it("should enforce initial valuation to be higher than final valuation", async function () {
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        (await trustFactory.deploy(
          {
            creator: signers[0].address,
            minimumCreatorRaise: minimumCreatorRaise,
            seeder,
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            // finalValuation: redeemInit.add(minimumCreatorRaise).add(seederFee),
            finalValuation: initialValuation.add(1),
          }
        )) as Trust,
      "revert MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 1)"
    );

    await Util.assertError(
      async () =>
        (await trustFactory.deploy(
          {
            creator: signers[0].address,
            minimumCreatorRaise: minimumCreatorRaise,
            seeder,
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
            crpFactory: crpFactory.address,
            balancerFactory: bFactory.address,
            reserve: reserve.address,
            reserveInit,
            initialValuation: redeemInit
              .add(minimumCreatorRaise)
              .add(seederFee)
              .add(reserveInit)
              .sub(1),
            finalValuation: redeemInit
              .add(minimumCreatorRaise)
              .add(seederFee)
              .add(reserveInit),
          }
        )) as Trust,
      "revert MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 2)"
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const seeder = signers[1].address; // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: redeemInit
          .add(minimumCreatorRaise)
          .add(seederFee)
          .add(reserveInit),
      }
    )) as Trust;

    await trust.deployed();

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(
      signers[1].address,
      await reserve.balanceOf(signers[0].address)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken;
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });

    const startBlock = await ethers.provider.getBlockNumber();

    const trust2 = new ethers.Contract(
      trust.address,
      trust.interface,
      signers[2]
    ) as Trust;
    // some other signer triggers trust to exit before unblock, should fail
    await Util.assertError(
      async () => await trust2.anonEndDistribution(),
      "revert BAD_PHASE",
      "trust exited before unblock"
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserveSeeder.transfer(signers[1].address, 1);
    }

    // some other signer triggers trust to exit after unblock, should succeed
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
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100" + Util.eighteenZeros
    );
    const owner = signers[0].address;
    const seeder = owner;
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 50;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise: minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: redeemInit
          .add(minimumCreatorRaise)
          .add(seederFee)
          .add(reserveInit),
      }
    )) as Trust;

    await trust.deployed();

    await reserve.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // users hit the minimum raise
    const spend1 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.eighteenZeros);
    await reserve.transfer(signers[1].address, spend1.mul(10));
    await reserve.transfer(signers[2].address, spend2);

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

    const bPool1 = bPool.connect(signers[1]);
    const reserve1 = reserve.connect(signers[1]);

    const crp1 = new ethers.Contract(
      await trustPool.crp(),
      crpJson.abi,
      signers[1]
    );

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights();
      await reserve1.approve(bPool1.address, spend1);
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        await trust.token(),
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
      i++;
    }

    const crp2 = crp.connect(signers[2]);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(signers[2]);
    const reserve2 = reserve.connect(signers[2]);
    await reserve2.approve(bPool2.address, spend2);

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.eighteenZeros)
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[1].address, 1);
    }

    const ownerBefore = await reserve.balanceOf(signers[0].address);
    await trust.anonEndDistribution();
    const dust = await reserve.balanceOf(bPool.address);
    const ownerAfter = await reserve.balanceOf(signers[0].address);
    const ownerDiff = ownerAfter.sub(ownerBefore);
    // Owner is the seeder so they lose dust here.
    const expectedOwnerDiff = ethers.BigNumber.from(
      "3300000000000000000000"
    ).sub(dust);

    assert(
      expectedOwnerDiff.eq(ownerDiff),
      `wrong owner diff ${expectedOwnerDiff} ${ownerDiff}`
    );

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[1]
    ) as RedeemableERC20;
    await token1.senderRedeem(await token1.balanceOf(signers[1].address));
    const reserveBalance1 = await reserve.balanceOf(signers[1].address);
    const expectedBalance1 = "1829852661873618767643";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong balance 1 after redemption: ${reserveBalance1} ${expectedBalance1}`
    );

    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;
    await token2.senderRedeem(await token2.balanceOf(signers[2].address));
    const reserveBalance2 = await reserve.balanceOf(signers[2].address);
    const expectedBalance2 = "170145949097001906142";
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const seeder = signers[0].address;
    const seederFee = ethers.BigNumber.from("100" + Util.eighteenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 15;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: redeemInit
          .add(minimumCreatorRaise)
          .add(seederFee)
          .add(reserveInit),
      }
    )) as Trust;

    (await trust.deployed()) as Trust;

    await reserve.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // have a few signers buy some tokens
    await reserve.transfer(
      signers[1].address,
      ethers.BigNumber.from("1000" + Util.eighteenZeros)
    );
    await reserve.transfer(
      signers[2].address,
      ethers.BigNumber.from("2000" + Util.eighteenZeros)
    );

    const trustPool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      signers[0]
    ) as RedeemableERC20Pool;

    let [crp, bPool] = await Util.poolContracts(signers, trustPool);

    const bPool1 = bPool.connect(signers[1]);
    const reserve1 = reserve.connect(signers[1]);
    await reserve1.approve(
      bPool1.address,
      ethers.BigNumber.from("1000" + Util.eighteenZeros)
    );

    await bPool1.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from("1000" + Util.eighteenZeros),
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.eighteenZeros)
    );
    const crp2 = crp.connect(signers[2]);
    await crp2.pokeWeights();

    const bPool2 = bPool.connect(signers[2]);
    const reserve2 = reserve.connect(signers[2]);
    await reserve2.approve(
      bPool2.address,
      ethers.BigNumber.from("2000" + Util.eighteenZeros)
    );

    await bPool2.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from("2000" + Util.eighteenZeros),
      await trust.token(),
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("1000000" + Util.eighteenZeros)
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[1].address, 1);
    }

    await trust.anonEndDistribution();

    const token1 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[1]
    ) as RedeemableERC20;
    await token1.senderRedeem(await token1.balanceOf(signers[1].address));
    const reserveBalance1 = await reserve.balanceOf(signers[1].address);
    const expectedBalance1 = "841320926251152929583";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong balance 1 after redemption: ${reserveBalance1} ${expectedBalance1}`
    );

    const token2 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      signers[2]
    ) as RedeemableERC20;
    await token2.senderRedeem(await token1.balanceOf(signers[2].address));
    const reserveBalance2 = await reserve.balanceOf(signers[2].address);
    const expectedBalance2 = "2158594779527790295800";
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

    const reserveInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.eighteenZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const initialValuation = ethers.BigNumber.from(
      "1000000" + Util.eighteenZeros
    );
    const minimumCreatorRaise = ethers.BigNumber.from("0");
    const seeder = signers[0].address;
    const seederFee = ethers.BigNumber.from("0");
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 10;

    const trust = (await trustFactory.deploy(
      {
        creator: signers[0].address,
        minimumCreatorRaise,
        seeder,
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
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: redeemInit
          .add(minimumCreatorRaise)
          .add(seederFee)
          .add(reserveInit),
      }
    )) as Trust;

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
