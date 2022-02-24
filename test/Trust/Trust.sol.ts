/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers, artifacts } from "hardhat";
import chai from "chai";
import type { NoticeEvent, Trust } from "../../typechain/Trust";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../Util";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { factoriesDeploy } from "../Util";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { ConfigurableRightsPool } from "../../typechain/ConfigurableRightsPool";
import type { BPool } from "../../typechain/BPool";
import type { Contract } from "ethers";
import { hexlify } from "ethers/lib/utils";
import type { SeedERC20 } from "../../typechain/SeedERC20";

const { assert } = chai;

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

const seedERC20Json = require("../../artifacts/contracts/seed/SeedERC20.sol/SeedERC20.json");
const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");

describe("Trust", async function () {
  it("should work on the happy path", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];
    const signer1 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 10;
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
    const seederCooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
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
        finalValuation,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: tier.address,
        minimumTier,
      },
      {
        seeder: Util.zeroAddress,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const { seeder } = await Util.getEventArgs(
      trust.deployTransaction,
      "Initialize",
      trust
    );

    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      creator
    ) as SeedERC20 & Contract;

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    const recipient = trust.address;

    const seeder1Units = 4;
    const seeder2Units = 6;

    // seeders needs some cash, give enough each for seeding
    await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units));
    await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));

    const seederContract1 = seederContract.connect(seeder1);
    const seederContract2 = seederContract.connect(seeder2);
    const reserve1 = reserve.connect(seeder1);
    const reserve2 = reserve.connect(seeder2);

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units));

    // seeders send reserve to seeder contract
    await seederContract1.seed(0, seeder1Units);
    await seederContract2.seed(0, seeder2Units);

    // Recipient gains infinite approval on reserve token withdrawals from seed contract
    await reserve.allowance(seederContract.address, recipient);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const startBlock = await ethers.provider.getBlockNumber();

    const reserveSpend = finalValuation.div(10);

    // signer1 fully funds raise
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

    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    await Util.createEmptyBlock(
      startBlock +
        minimumTradingDuration -
        (await ethers.provider.getBlockNumber())
    );

    // seeder1 ends raise
    await trust.connect(seeder1).endDutchAuction();

    // owner pulls reserve
    await reserve
      .connect(creator)
      .transferFrom(
        trust.address,
        creator.address,
        await reserve.allowance(trust.address, creator.address)
      );

    // seeder1 pulls erc20
    await seederContract
      .connect(seeder1)
      .pullERC20(await reserve.allowance(trust.address, seeder));

    // seeders redeem funds
    await seederContract1.redeem(seeder1Units, 0);
    await seederContract2.redeem(seeder2Units, 0);

    // signer1 pulls erc20 into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    await token
      .connect(signer1)
      .redeem([reserve.address], await token.balanceOf(signer1.address));
  });

  it("should work happily if griefer sends small amount of reserve to contracts and signers", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.NIL;

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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
    const griefer = signers[4];

    // griefer acquires 1m reserve somehow
    await reserve.transfer(
      griefer.address,
      ethers.BigNumber.from("1000000" + Util.sixZeros)
    );

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;
    const crp = new ethers.Contract(
      await trust.crp(),
      (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
      creator
    ) as ConfigurableRightsPool & Contract;

    // attempt to grief contracts and signers
    await reserve
      .connect(griefer)
      .transfer(trust.address, "10" + Util.sixZeros);
    await reserve
      .connect(griefer)
      .transfer(token.address, "10" + Util.sixZeros);
    await reserve.connect(griefer).transfer(crp.address, "10" + Util.sixZeros);
    await reserve
      .connect(griefer)
      .transfer(creator.address, "10" + Util.sixZeros);
    await reserve
      .connect(griefer)
      .transfer(seeder.address, "10" + Util.sixZeros);
    await reserve
      .connect(griefer)
      .transfer(deployer.address, "10" + Util.sixZeros);
    await reserve
      .connect(griefer)
      .transfer(signer1.address, "10" + Util.sixZeros);

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      (await artifacts.readArtifact("BPool")).abi,
      creator
    ) as BPool & Contract;

    await reserve
      .connect(griefer)
      .transfer(bPool.address, "10" + Util.sixZeros);

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

    await trust.endDutchAuction();
  });

  it("should allow anon to emit Notice event", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    const message = "foo";
    const notice = hexlify([...Buffer.from(message)]);

    const event0 = (await Util.getEventArgs(
      await trust.connect(signer1).sendNotice(notice),
      "Notice",
      trust
    )) as NoticeEvent["args"];

    assert(event0.sender === signer1.address, "wrong sender in event0");
    assert(event0.data === notice, "wrong data in event0");
  });

  it("should burn token dust when closing pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;
    const crp = new ethers.Contract(
      await trust.crp(),
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
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      (await artifacts.readArtifact("BPool")).abi,
      creator
    ) as BPool & Contract;

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

    await trust.endDutchAuction();

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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;
    const crp = new ethers.Contract(
      await trust.crp(),
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
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      (await artifacts.readArtifact("BPool")).abi,
      creator
    ) as BPool & Contract;

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

    await trust.endDutchAuction();
  });

  it("should calculate weights correctly when no trading occurs", async function () {
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
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      seeder
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [crp, bPool] = await Util.poolContracts(signers, trust);

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

    await trust.endDutchAuction();

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

  it("should succeed if raise amount equals minimum raise + dust", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

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

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [crp, bPool] = await Util.poolContracts(signers, trust);

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

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    const finalBPoolBalance = await reserve.balanceOf(bPool.address);

    console.log(`bPool balance  ${finalBPoolBalance}`);

    assert(
      finalBPoolBalance.eq(successLevel.add(dustAtSuccessLevel)),
      `pool balance equal to success level + dust
      finalBPoolBalance   ${finalBPoolBalance}
      successLevel        ${successLevel}
      dustAtSuccessLevel  ${dustAtSuccessLevel}`
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 0);
    }

    await trust.endDutchAuction();

    const actualBPoolDust = await reserve.balanceOf(bPool.address);

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `should be SUCCESS; raise should have succeeded when hitting minimum raise exactly
      distributionStatus  ${await trust.getDistributionStatus()}
      finalBPoolBalance   ${finalBPoolBalance}
      successLevel        ${successLevel}
      actualBPoolDust     ${actualBPoolDust}`
    );
  });

  it("should set next phase when raise end has been triggered", async function () {
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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;

    assert(
      (await token.currentPhase()).eq(Phase.ONE),
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    assert(
      (await token.currentPhase()).eq(Phase.ONE),
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[3].address, 1);
    }

    assert(
      (await token.currentPhase()).eq(Phase.ONE),
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );

    await trust.endDutchAuction();

    assert(
      (await token.currentPhase()).eq(Phase.TWO),
      `expected phase ${Phase.TWO} but got ${await token.currentPhase()}`
    );
  });

  it("should add reserve init to pool balance after raise begins", async function () {
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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    const { config: configEvent } = await Util.getEventArgs(
      trust.deployTransaction,
      "Initialize",
      trust
    );

    assert(
      !configEvent.reserveInit.isZero(),
      "reserveInit variable was zero on trust construction"
    );

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [, bPool2] = await Util.poolContracts(signers, trust);

    assert(
      (await reserve.balanceOf(seeder.address)).isZero(),
      "seeder did not transfer reserve init during raise start"
    );

    // trading pool reserve balance must be non-zero after raise start
    const bPoolReserveBalance = await reserve.balanceOf(bPool2.address);
    assert(
      bPoolReserveBalance.eq(reserveInit),
      `wrong reserve amount in trust when raise started
    trust reserve   ${await reserve.balanceOf(trust.address)}
    bPool reserve   ${bPoolReserveBalance}
    reserve init    ${reserveInit}`
    );
  });

  it("should set correct phases for token and pool", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // seeder is not creator/owner

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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;

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
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    // current pool phase should be ONE
    assert(
      (await trust.currentPhase()).eq(Phase.ONE),
      `expected phase ${Phase.ONE} but got ${await trust.currentPhase()}`
    );

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    // pool phase ONE block should be set
    assert(
      (await trust.phaseBlocks(Phase.ONE)) === startBlock,
      `wrong startBlock
      expected  ${startBlock}
      got       ${await trust.phaseBlocks(Phase.ONE)}
      `
    );

    // pool phase TWO block should be set
    assert(
      (await trust.phaseBlocks(Phase.TWO)) ===
        startBlock + minimumTradingDuration + 1,
      `wrong pool phase TWO block
      expected  ${startBlock + minimumTradingDuration + 1}
      got       ${await trust.phaseBlocks(Phase.TWO)}
      `
    );

    // current pool phase should be TWO, as trading is in progress
    assert(
      (await trust.currentPhase()).eq(Phase.TWO),
      `expected phase ${Phase.TWO} but got ${await trust.currentPhase()}`
    );

    // create a few blocks by sending some tokens around
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[2].address, 1);
    }

    // current pool phase should be THREE, as it is 1 block after trading ended
    assert(
      (await trust.currentPhase()).eq(Phase.THREE),
      `expected phase ${Phase.THREE} but got ${await trust.currentPhase()}`
    );

    // token phase should still be ONE
    // if it is, a user may accidentally redeem before raise ended, hence redeeming will return zero reserve to the user
    assert(
      (await token.currentPhase()).eq(Phase.ONE),
      `expected phase ${Phase.ONE} but got ${await token.currentPhase()}`
    );

    await trust.endDutchAuction();

    // token should be in phase TWO
    assert(
      (await token.currentPhase()).eq(Phase.TWO),
      `expected phase ${Phase.TWO} but got ${await token.currentPhase()}`
    );

    // current pool phase should be FOUR, as raise has ended
    assert(
      (await trust.currentPhase()).eq(Phase.FOUR),
      `expected phase ${Phase.FOUR} but got ${await trust.currentPhase()}`
    );
  });

  it("should allow anyone to start raise when seeder has transferred sufficient reserve liquidity", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];

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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;

    // seeder transfers insufficient reserve liquidity
    await reserveSeeder.transfer(trust.address, reserveInit.sub(1));

    // 'anyone'
    const trust2 = trust.connect(signers[2]);

    await Util.assertError(
      async () => await trust2.startDutchAuction({ gasLimit: 100000000 }),
      "ERC20: transfer amount exceeds balance",
      "raise wrongly started before seeder provided sufficent seed reserve liquidity"
    );

    // seeder approves sufficient reserve liquidity
    await reserveSeeder.transfer(trust.address, 1);

    // anyone can start distribution
    await trust2.startDutchAuction({ gasLimit: 100000000 });
  });

  it("should only allow trust endRaise to succeed after pool trading ended", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];

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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    // creator attempts to immediately end raise
    await Util.assertError(
      async () => await trust.endDutchAuction(),
      "BAD_PHASE",
      "creator ended raise before pool trading ended"
    );

    const trust2 = new ethers.Contract(
      trust.address,
      (await artifacts.readArtifact("Trust")).abi,
      signers[2]
    ) as Trust & Contract;

    // other user attempts to immediately end raise
    await Util.assertError(
      async () => await trust2.endDutchAuction(),
      "BAD_PHASE",
      "other user ended raise before pool trading ended"
    );
  });

  it("should allow only token admin (Trust) to set senders/receivers", async function () {
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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;

    // creator cannot add unfreezable
    await Util.assertError(
      async () => await token.grantReceiver(signers[3].address),
      "ONLY_ADMIN",
      "creator added receiver, despite not being token admin"
    );

    const token1 = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      signers[2]
    ) as RedeemableERC20 & Contract;

    // non-creator cannot add unfreezable, (no one but admin can add receiver)
    await Util.assertError(
      async () => await token1.grantReceiver(signers[3].address),
      "ONLY_ADMIN",
      "anon added receiver, despite not being token admin"
    );

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
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });
  });

  it("should correctly calculate duration of pool, denominated in blocks from the block that seed funds are claimed", async function () {
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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(
      seeder.address,
      (await reserve.balanceOf(signers[0].address)).div(2)
    );

    const reserveSeeder = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    ) as ReserveToken & Contract;
    await reserveSeeder.transfer(trust.address, reserveInit);

    const blockBeforeRaiseSetup = await ethers.provider.getBlockNumber();
    const expectedPhaseBlock = blockBeforeRaiseSetup + minimumTradingDuration;
    let blockCount = 0;

    await trust.startDutchAuction({ gasLimit: 100000000 });

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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

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

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
    ) as ReserveToken & Contract;

    // seeder must transfer before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

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

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users hit the minimum raise

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    let i = 0;
    while (i < 10) {
      await crp.connect(signer1).pokeWeights(); // user pokes weights to get best deal for the current block
      await reserve.connect(signer1).approve(bPool.address, spend1); // approves pool swap amount
      await bPool.connect(signer1).swapExactAmountIn(
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

    await crp.connect(signer2).pokeWeights();

    await reserve.connect(signer2).approve(bPool.address, spend2);

    await bPool
      .connect(signer2)
      .swapExactAmountIn(
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

    await trust.endDutchAuctionAndTransfer();

    const poolDust = await reserve.balanceOf(bPool.address);
    const availableBalance = finalBalance.sub(poolDust);
    const seederPay = reserveInit.add(seederFee);

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
      .add(seederFee);
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

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
    const minimumCreatorRaise = ethers.BigNumber.from("10000" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit);
    const seederStartingReserveBalance = await reserve.balanceOf(
      seeder.address
    );

    // seeder must transfer before pool init
    await reserve.connect(seeder).transfer(trust.address, reserveInit);

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

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const creatorStartingReserveBalance = await reserve.balanceOf(
      creator.address
    );

    // BEGIN: users FAIL to hit the minimum raise

    const [crp, bPool] = await Util.poolContracts(signers, trust);
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

    await trust.endDutchAuctionAndTransfer();

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
    const seederEndExpected = seederStartingReserveBalance;
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
    const expectedRemainderReserveBalance = finalBalance
      .sub(reserveInit)
      .sub(poolDust);
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2];

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

    const trustFactory1 = trustFactory.connect(deployer);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    const seederReserveBeforeStart = await reserve.balanceOf(seeder.address);

    await Util.assertError(
      async () => await trust.startDutchAuction({ gasLimit: 100000000 }),
      "ERC20: transfer amount exceeds balance",
      "initiated raise before seeder transferred reserve token"
    );

    // seeder must transfer before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const seederReserveAfterStart = await reserve.balanceOf(seeder.address);

    assert(
      seederReserveBeforeStart.sub(seederReserveAfterStart).eq(reserveInit),
      `wrong reserve amount moved to pool ${seederReserveBeforeStart} ${seederReserveAfterStart}`
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

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({
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
      async () => await trust2.endDutchAuction(),
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
    await trust2.endDutchAuctionAndTransfer();

    // trust should no longer hold any reserve
    assert(
      (await reserve.balanceOf(trust.address)).eq(0),
      "trust still holds non-zero reserve balance"
    );
  });

  it("should NOT refund successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1];
    const deployer = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

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

    const minimumTradingDuration = 50;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    await reserve.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({
      gasLimit: 100000000,
    });
    const startBlock = await ethers.provider.getBlockNumber();

    // users hit the minimum raise
    const spend1 = ethers.BigNumber.from("300" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("300" + Util.sixZeros);
    await reserve.transfer(signer1.address, spend1.mul(10));
    await reserve.transfer(signer2.address, spend2);

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const bPool1 = bPool.connect(signer1);
    const reserve1 = reserve.connect(signer1);

    const crp1 = new ethers.Contract(
      await trust.crp(),
      (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
      signer1
    ) as ConfigurableRightsPool & Contract;

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
    await trust.endDutchAuctionAndTransfer();
    const seederAfter = await reserve.balanceOf(seeder.address);
    const seederDiff = seederAfter.sub(seederBefore);
    // Seeder loses dust here.
    const expectedSeederDiff = ethers.BigNumber.from("2100000000");

    assert(
      expectedSeederDiff.eq(seederDiff),
      `wrong seeder diff
      expected  ${expectedSeederDiff}
      got       ${seederDiff}`
    );

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
    const expectedBalance1 = "1829853948";
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
      await token2.balanceOf(signer2.address)
    );
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

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];
    const signer2 = signers[4];

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
    const minimumCreatorRaise = ethers.BigNumber.from("100000" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 15;

    const trustFactory1 = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const trust = await Util.trustDeploy(
      trustFactory1,
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

    await reserve.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({
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

    const [crp, bPool] = await Util.poolContracts(signers, trust);

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

    await trust.endDutchAuctionAndTransfer();

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
    const expectedBalance1 = "841064126";
    assert(
      ethers.BigNumber.from(expectedBalance1).eq(reserveBalance1),
      `wrong signer1 reserve balance after redemption
      expected  ${expectedBalance1}
      got       ${reserveBalance1}`
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
    const expectedBalance2 = "2157935881";
    assert(
      ethers.BigNumber.from(expectedBalance2).eq(reserveBalance2),
      `wrong signer2 reserve balance after redemption
      expected  ${expectedBalance2}
      got       ${reserveBalance2}`
    );
  });

  it("should create tokens", async function () {
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
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("0");
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

    await reserve.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({
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

    await trust.endDutchAuction();
  });
});
