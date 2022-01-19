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
import { factoriesDeploy } from "../Util";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

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

describe("TrustConstruction", async function () {
  it("should allow TrustFactory to create multiple child Trust contracts", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    const trust2 = await Util.trustDeploy(
      trustFactoryDeployer,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const redeemableERC20 = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    assert(
      (await redeemableERC20.balanceOf(trust.address)).eq(totalTokenSupply)
    );
  });

  it("should error if totalTokenSupply is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("0" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel,
            minimumTradingDuration,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel,
            minimumTradingDuration,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    // a redeemInit value of zero causes division by zero in following pool calculation
    // i.e. _tokenWeightFinal = _targetSpotFinal / redeemInit
    await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );
  });

  it("should return raise success balance", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trust = await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const { successBalance } = await Util.getEventArgs(
      trust.deployTransaction,
      "Initialize",
      trust
    );

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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trust = await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const { seeder: seederEvent, config: configEvent } =
      await Util.getEventArgs(trust.deployTransaction, "Initialize", trust);

    assert(configEvent.creator === creator.address, "wrong creator");
    assert(seederEvent === seeder.address, "wrong seeder");
    assert(
      configEvent.minimumCreatorRaise.eq(minimumCreatorRaise),
      "wrong minimum raise amount"
    );
    assert(configEvent.seederFee.eq(seederFee), "wrong seeder fee");
    assert(configEvent.redeemInit.eq(redeemInit), "wrong redeem init");
  });

  it("should configure tier correctly", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
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
      (await token.minimumTier()).eq(minimumTier),
      "wrong tier level set on token"
    );
  });

  it("should mint the correct amount of tokens on construction", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from(
      "100000" + Util.eighteenZeros
    );
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("100000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100");

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trust = await Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
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

    const creator = signers[0];
    // const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    const trustPromise = Util.trustDeploy(
      trustFactory.connect(deployer),
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      {
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await Util.assertError(
      async () => (await trustPromise)[0] as Trust,
      "Error: invalid address or ENS name",
      "initialized without seeder"
    );
  });

  it("should enforce final valuation greater than fundraise success", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: successLevel.sub(1),
            minimumTradingDuration,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
            reserve: reserve.address,
            reserveInit: totalTokenSupply.add(1),
            initialValuation,
            finalValuation: successLevel,
            minimumTradingDuration,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_WEIGHT_VALUATION",
      "did not enforce restriction that valuation weight be greater than minimum weight"
    );
  });

  it("should enforce initial valuation to be higher than final valuation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const minimumTradingDuration = 10;

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
            reserve: reserve.address,
            reserveInit,
            initialValuation,
            finalValuation: initialValuation.add(1),
            minimumTradingDuration,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 1)"
    );

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
          trustFactory.connect(deployer),
          creator,
          {
            creator: creator.address,
            minimumCreatorRaise,
            seederFee,
            redeemInit,
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
          {
            erc20Config: redeemableERC20Config,
            tier: tier.address,
            minimumTier,
          },
          {
            seeder: seeder.address,
            cooldownDuration: seederCooldownDuration,
            erc20Config: seedERC20Config,
          },
          { gasLimit: 100000000 }
        ),
      "MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 2)"
    );
  });
});
