/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../../typechain/Trust";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../Util";
import type { Contract } from "ethers";
import type { BigNumber } from "ethers";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import { factoriesDeploy, max_uint32 } from "../Util";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

const poolJson = require("../../artifacts/contracts/pool/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");

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
  tier: string;
  crp: string;
  pool: string;
}

describe("TrustConstruction", async function () {
  it("should allow TrustFactory to create multiple child Trust contracts", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust1 = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    const trust2 = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
        seederCooldownDuration,
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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    assert(
      await trustFactory.isChild(trust1.address),
      "child trust1 contract was not registered"
    );

    assert(
      await trustFactory.isChild(trust2.address),
      "child trust2 contract was not registered"
    );

    assert(
      trust1.address !== trust2.address,
      "wrongly deployed successive trusts with same address"
    );
  });

  it("should create a token and immediately send all supply to the pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const redeemableERC20 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    assert((await redeemableERC20.balanceOf(trust.address)).eq(0));
    assert(
      (await redeemableERC20.balanceOf(await trust.pool())).eq(totalTokenSupply)
    );
  });

  it("should include correct values when calling getContracts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const getContractsDeployed: TrustContracts = await trust.getContracts();

    const token = await trust.token();
    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool & Contract;

    const [crp] = await Util.poolContracts(signers, pool);

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
      getContractsDeployed.tier === tier.address,
      `wrong tier address ${getContractsDeployed.tier} ${tier.address}`
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
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const [, bPool2] = await Util.poolContracts(signers, pool);

    const getContractsTrading = (await trust.getContracts()) as TrustContracts;

    assert(
      getContractsTrading.pool === bPool2.address,
      `wrong balancer pool address ${getContractsTrading.pool} ${bPool2.address}`
    );
  });

  it("should error if totalTokenSupply is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("0" + Util.eighteenZeros);
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

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_TOKEN_SUPPLY",
      "setting totalTokenSupply to zero did not error"
    );
  });

  it("should error if reserveInit is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("0" + Util.sixZeros);
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

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "RESERVE_INIT_MINIMUM",
      "setting reserveInit to zero did not error"
    );
  });

  it("should allow redeemInit to be zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    // a redeemInit value of zero causes division by zero in following pool calculation
    // i.e. _tokenWeightFinal = _targetSpotFinal / redeemInit
    await Util.trustDeploy(
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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );
  });

  it("should include correct values when calling getDistributionProgress", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

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
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const raiseProgressSeeded: DistributionProgress =
      await trust.getDistributionProgress();

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool & Contract;

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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const distributionProgressTrading: DistributionProgress =
      await trust.getDistributionProgress();

    const distributionStartBlock = await ethers.provider.getBlockNumber();
    const distributionEndBlock =
      distributionStartBlock + minimumTradingDuration + 1;

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    const [crp, bPool] = await Util.poolContracts(signers, pool);

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

    const spend = ethers.BigNumber.from("10" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

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

  it("should return raise success balance", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const successBalance = await trust.successBalance();

    assert(
      successLevel.eq(successBalance),
      `wrong success balance
    expected  ${successLevel}
    got       ${successBalance}`
    );
  });

  it("should allow third party to deploy trust, independently of creator and seeder", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
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
    assert((await trust.redeemInit()).eq(redeemInit), "wrong redeem init");
  });

  it("should configure tier correctly", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    assert(
      (await token.minimumTier()) === minimumStatus,
      "wrong tier level set on token"
    );
  });

  it("should mint the correct amount of tokens on construction", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    assert(
      (await token.totalSupply()).eq(totalTokenSupply),
      "wrong amount of tokens minted"
    );
  });

  it("should not initialize without seeder", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const creator = signers[0];
    // const seeder = signers[1]; // seeder is not creator/owner
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

    const trustPromise = Util.trustDeploy(
      trustFactory1,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        seederUnits,
        seederCooldownDuration,
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
        minimumTradingDuration,
      },
      { gasLimit: 100000000 }
    );

    await Util.assertError(
      async () => (await trustPromise) as Trust,
      "Error: invalid ENS name",
      "initialized without seeder"
    );
  });

  it("should enforce final valuation greater than fundraise success", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            finalValuation: successLevel.sub(1),
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_FINAL_VALUATION",
      "did not enforce restriction that final valuation larger than success level"
    );
  });

  it("should enforce minted tokens to be greater than liquidity", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 10;

    const trustFactory1 = trustFactory.connect(deployer);

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            reserveInit: totalTokenSupply.add(1),
            initialValuation,
            finalValuation: successLevel,
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_TOKEN_SUPPLY",
      "did not enforce restriction that minted tokens be greater than liquidity"
    );
  });

  it("should enforce initial valuation to be higher than final valuation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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

    const minimumTradingDuration = 10;

    const trustFactory1 = trustFactory.connect(deployer);

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            finalValuation: initialValuation.add(1),
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 1)"
    );

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            initialValuation: redeemInit
              .add(minimumCreatorRaise)
              .add(seederFee)
              .add(reserveInit)
              .sub(1),
            finalValuation: redeemInit
              .add(minimumCreatorRaise)
              .add(seederFee)
              .add(reserveInit),
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 2)"
    );
  });
});
