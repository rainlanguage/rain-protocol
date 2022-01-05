/* eslint-disable @typescript-eslint/no-var-requires */
import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { Contract } from "ethers";
import { factoriesDeploy } from "../Util";
import type { SeedERC20 } from "../../typechain/SeedERC20";

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

describe("RedeemableERC20Pool", async function () {
  it("should construct with minimum raise duration of 1", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];
    const signer1 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;
    const seedPrice = reserveInit.div(10);

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 1;

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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
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

    const allowance = await reserve.allowance(trust.address, seeder);
    // seeder1 pulls erc20
    await seederContract.connect(seeder1).pullERC20(allowance);

    // seeders redeem funds
    await seederContract1.redeem(seeder1Units);
    await seederContract2.redeem(seeder2Units);

    // signer1 pulls erc20 into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    await token
      .connect(signer1)
      .redeem([reserve.address], await token.balanceOf(signer1.address));
  });

  it("should revert construction with minimum trading duration of 0", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 0;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await Util.assertError(
      async () =>
        await Util.trustDeploy(
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
            erc20Config,
            tier: tier.address,
            minimumTier,
            totalSupply: totalTokenSupply,
          },
          {
            seeder: Util.zeroAddress,
            seederUnits,
            seederCooldownDuration,
            seedERC20Config,
          },
          { gasLimit: 100000000 }
        ),
      "0_TRADING_DURATION",
      "wrongly constructed pool with 0 minimum trading duration"
    );
  });

  it("should safely poke weights after minimum trading duration", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];
    const signer1 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
    const seederContract = new ethers.Contract(
      seeder,
      seedERC20Json.abi,
      creator
    ) as SeedERC20 & Contract;

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

    const expectedPhaseOneBlock = (await ethers.provider.getBlockNumber()) + 1;
    const expectedPhaseTwoBlock =
      expectedPhaseOneBlock + minimumTradingDuration + 1;

    await trust.startDutchAuction({
      gasLimit: 10000000,
    });

    const actualPhaseOneBlock = await trust.phaseBlocks(0);
    const actualPhaseTwoBlock = await trust.phaseBlocks(1);

    assert(
      expectedPhaseOneBlock === actualPhaseOneBlock,
      `wrong start block from trust.phaseBlocks
      expected ${expectedPhaseOneBlock} got ${actualPhaseOneBlock}`
    );

    assert(
      expectedPhaseTwoBlock === actualPhaseTwoBlock,
      `wrong end block from trust.phaseBlocks
        expected ${expectedPhaseTwoBlock} got ${actualPhaseTwoBlock}`
    );

    const [crp] = await Util.poolContracts(signers, trust);

    while (
      (await ethers.provider.getBlockNumber()) <=
      expectedPhaseTwoBlock + 2
    ) {
      await crp.pokeWeights();

      const actualStartBlock = await trust.phaseBlocks(0);
      const actualEndBlock = await trust.phaseBlocks(1);

      assert(
        actualStartBlock === expectedPhaseOneBlock,
        `wrong start block from trust.phaseBlocks after pokeWeights
        expected ${expectedPhaseOneBlock} got ${actualStartBlock}
        current block ${await ethers.provider.getBlockNumber()}
        final auction block ${expectedPhaseTwoBlock}`
      );

      assert(
        expectedPhaseTwoBlock === actualEndBlock,
        `wrong end block from trust.phaseBlocks after pokeWeights
        expected ${expectedPhaseTwoBlock} got ${actualEndBlock}`
      );
    }
  });

  it("should expose correct final weight", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;

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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const finalWeight = await trust.finalWeight();

    assert(
      finalWeight.eq(finalValuation.mul(Util.ONE).div(reserveInit)),
      `final weight should equal finalValuation / totalSupply with no trading
      expected    ${finalValuation.mul(Util.ONE).div(reserveInit)}
      got         ${finalWeight}`
    );
  });

  it("should transfer all raised funds to owner on pool exit (worst case - manually pulling reserve)", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];
    const signer1 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
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

    const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address);
    const ownerReserveBeforeExit = await reserve.balanceOf(creator.address);
    const trustReserveBeforeExit = await reserve.balanceOf(trust.address);

    // seeder1 ends raise
    await trust.connect(seeder1).endDutchAuction();

    // moves to phase THREE immediately when ending raise
    assert(
      (await trust.currentPhase()) === Phase.THREE,
      `expected phase ${Phase.THREE} but got ${await trust.currentPhase()}`
    );

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);
    const ownerReserveAfterExit = await reserve.balanceOf(creator.address);
    const trustReserveAfterExit = await reserve.balanceOf(trust.address);

    const reserveDust = Util.estimateReserveDust(bPoolReserveBeforeExit).add(
      2 // 1 left behind + 1 for rounding error
    );

    assert(
      bPoolReserveAfterExit.eq(reserveDust),
      `wrong reserve left in balancer pool, expected dust
      actual      ${bPoolReserveAfterExit}
      expected    ${reserveDust}`
    );

    // owner pulls reserve
    await reserve
      .connect(creator)
      .transferFrom(
        trust.address,
        creator.address,
        await reserve.allowance(trust.address, creator.address)
      );

    // seeder1 pulls reserve into SeedERC20 contract
    await seederContract
      .connect(seeder1)
      .pullERC20(await reserve.allowance(trust.address, seeder));

    // signer1 pulls reserve into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    const bPoolReserveAfterTransferApproved = await reserve.balanceOf(
      bPool.address
    );
    const ownerReserveAfterTransferApproved = await reserve.balanceOf(
      creator.address
    );
    const trustReserveAfterTransferApproved = await reserve.balanceOf(
      trust.address
    );

    console.log({
      ownerReserveBeforeExit,
      bPoolReserveBeforeExit,
      trustReserveBeforeExit,
      ownerReserveAfterExit,
      bPoolReserveAfterExit,
      trustReserveAfterExit,
      ownerReserveAfterTransferApproved,
      bPoolReserveAfterTransferApproved,
      trustReserveAfterTransferApproved,
    });

    // uint256 availableBalance_ = self_.reserve().balanceOf(address(this));
    const availableBalance = trustReserveAfterExit;

    // uint256 seederPay_ = self_.reserveInit().saturatingSub(poolDust_);
    // seederPay_ = seederPay_.saturatingAdd(self_.seederFee());
    const seederPay = reserveInit.sub(reserveDust).add(seederFee);

    // creatorPay_ = availableBalance_
    //                 .saturatingSub(
    //                     seederPay_.saturatingAdd(self_.redeemInit())
    //                 );
    const expectedCreatorPay = availableBalance.sub(seederPay.add(redeemInit));

    assert(
      ownerReserveAfterTransferApproved.eq(
        ownerReserveBeforeExit.add(expectedCreatorPay)
      ),
      `wrong owner reserve balance
      actual      ${ownerReserveAfterTransferApproved}
      expected    ${ownerReserveBeforeExit.add(expectedCreatorPay)}`
    );
  });

  it("should only allow owner to set pool phases, and anyone can start raise", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    await Util.assertError(
      async () => await trust.endDutchAuction(),
      "BAD_PHASE",
      "owner was wrongly able to exit raise before trading was started"
    );

    const seeder = await trust.seeder();
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

    const now = await ethers.provider.getBlockNumber();
    const raiseEndBlock = now + minimumTradingDuration;

    await Util.assertError(
      async () =>
        await trust.startDutchAuction({
          gasLimit: 10000000,
        }),
      "BAD_PHASE",
      "pool trading wrongly initialized twice by owner"
    );

    // Exit pool

    // Before raiseEndBlock
    await Util.assertError(
      async () => await trust.endDutchAuction(),
      "BAD_PHASE",
      "owner was wrongly able to exit pool before raiseEndBlock"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < raiseEndBlock) {
      await reserve.transfer(signers[9].address, 1);
    }

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

    const allowance = await reserve.allowance(trust.address, seeder);
    // seeder1 pulls erc20
    await seederContract.connect(seeder1).pullERC20(allowance);

    // seeders redeem funds
    await seederContract1.redeem(seeder1Units);
    await seederContract2.redeem(seeder2Units);

    // signer1 pulls erc20 into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    await token
      .connect(signer1)
      .redeem([reserve.address], await token.balanceOf(signer1.address));
  });

  it("should correctly calculate exit balances if people grief balancer", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[1];
    const deployer = signers[2]; // deployer is not creator
    const seeder1 = signers[3];
    const seeder2 = signers[4];
    const griefer = signers[5];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumTier = Tier.GOLD;

    await tier.setTier(griefer.address, Tier.GOLD, []);

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
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

    const griefAmount = ethers.BigNumber.from("100000000");

    // send excess reserve before the auction starts.
    // random ppl could do this.
    await reserve.transfer(trust.address, griefAmount);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    // send excess reserve to the bPool after the auction starts and gulp it.
    // random ppl could do this.
    await reserve.transfer(bPool.address, griefAmount);
    await bPool.connect(griefer).gulp(reserve.address);

    // send griefer tokens to the bPool after the auction starts and gulp it.
    // random ppl could do this.
    await token
      .connect(griefer)
      .transfer(bPool.address, await token.balanceOf(griefer.address));
    await bPool.connect(griefer).gulp(token.address);

    const startBlock = await ethers.provider.getBlockNumber();

    const reserveSpend = finalValuation.div(10);

    // griefer fully funds raise
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

    await swapReserveForTokens(griefer, reserveSpend);

    // Send a bunch of reserve to the bPool that it won't have accounted for
    // in its internal records, because there is no gulp.
    await reserve.transfer(bPool.address, griefAmount);
    // Send griefer tokens to the bPool that it won't have accounted for
    // in its internal records, because there is no gulp.
    await token
      .connect(griefer)
      .transfer(bPool.address, await token.balanceOf(griefer.address));

    await swapReserveForTokens(griefer, reserveSpend);

    // send excess reserve to the trust after the auction starts.
    // random ppl could do this.
    await reserve.transfer(trust.address, griefAmount);
    // send griefer tokens to the trust after the auction starts.
    // random ppl could do this.
    await token
      .connect(griefer)
      .transfer(trust.address, await token.balanceOf(griefer.address));

    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(griefer, reserveSpend);
    }

    const bPoolReserveSuccess = await reserve.balanceOf(bPool.address);

    await Util.createEmptyBlock(
      startBlock +
        minimumTradingDuration -
        (await ethers.provider.getBlockNumber())
    );

    // seeder1 ends raise
    // await trust.connect(seeder1).endDutchAuctionAndTransfer();
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
    await seederContract1.redeem(seeder1Units);
    await seederContract2.redeem(seeder2Units);

    // griefer pulls erc20 into RedeemableERC20 contract
    await token
      .connect(griefer)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    await token
      .connect(griefer)
      .redeem([reserve.address], await token.balanceOf(griefer.address));

    const expectedCreatorFinalReserveBalance = bPoolReserveSuccess
      .add(griefAmount.mul(2))
      .sub(await reserve.balanceOf(griefer.address))
      .sub(await reserve.balanceOf(seeder1.address))
      .sub(await reserve.balanceOf(seeder2.address))
      .sub(Util.estimateReserveDust(bPoolReserveSuccess))
      .sub(2); // rounding?

    assert(
      (await reserve.balanceOf(creator.address)).eq(
        expectedCreatorFinalReserveBalance
      ),
      `wrong creator final reserve balance
      expected  ${expectedCreatorFinalReserveBalance}
      got       ${await reserve.balanceOf(creator.address)}`
    );

    assert(
      (await token.balanceOf(trust.address)).isZero(),
      `wrong trust final token balance, should've been burned
      expected  0
      got       ${await token.balanceOf(trust.address)}`
    );
    assert(
      (await token.totalSupply()).eq(
        (await token.balanceOf(griefer.address)).add(
          await token.balanceOf(bPool.address) // token dust
        )
      ),
      "wrong final redeemable token supply"
    );
  });

  it("should construct a pool with whitelisting", async function () {
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
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
        erc20Config,
        tier: tier.address,
        minimumTier,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    await trust.deployed();

    const seeder = await trust.seeder();
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

    // whitelisted LPs
    await Util.assertError(
      async () => await crp.joinPool(1, []),
      "ERR_NOT_ON_WHITELIST",
      "non-whitelisted signer wrongly joined pool"
    );

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
    await seederContract1.redeem(seeder1Units);
    await seederContract2.redeem(seeder2Units);

    // signer1 pulls erc20 into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));

    await token
      .connect(signer1)
      .redeem([reserve.address], await token.balanceOf(signer1.address));
  });

  it("should fail to construct pool if initial reserve amount is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
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

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = 0;
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await Util.assertError(
      async () => {
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
            erc20Config,
            tier: tier.address,
            minimumTier,
            totalSupply: totalTokenSupply,
          },
          {
            seeder: Util.zeroAddress,
            seederUnits,
            seederCooldownDuration,
            seedERC20Config,
          },
          { gasLimit: 100000000 }
        );
        await trust.deployed();
      },
      "", // should fail in general
      "failed to error when reserve init below minimum at construction"
    );
  });
});
