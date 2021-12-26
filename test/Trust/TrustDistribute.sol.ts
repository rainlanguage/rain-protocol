/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../Util";
import type { Contract } from "ethers";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import { factoriesDeploy } from "../Util";
import type { SeedERC20 } from "../../typechain/SeedERC20";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");
const seedERC20Json = require("../../artifacts/contracts/seed/SeedERC20.sol/SeedERC20.json");

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

enum RaiseStatus {
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

describe("TrustDistribute", async function () {
  it("should allow pulling approved ERC20 into seed and token contracts after auction has ended", async () => {
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
    const minimumStatus = Tier.GOLD;

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

    await tier.setTier(signer1.address, Tier.GOLD, []);

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: Util.zeroAddress,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    await reserve
      .connect(seeder1)
      .approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve
      .connect(seeder2)
      .approve(seederContract.address, seedPrice.mul(seeder2Units));

    // seeders send reserve to seeder contract
    await seederContract.connect(seeder1).seed(0, seeder1Units);

    await seederContract.connect(seeder2).seed(0, seeder2Units);

    // Recipient gains infinite approval on reserve token withdrawals from seed contract
    await reserve.allowance(seederContract.address, recipient);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const startBlock = await ethers.provider.getBlockNumber();

    const reserveSpend = finalValuation.div(10);

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

    // signer1 fully funds raise
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    // add blocks until raise can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    // seeder1 ends raise
    await trust.connect(seeder1).endDutchAuction();

    // Guard against someone accidentally calling redeem before any reserve has been returned.
    await Util.assertError(
      async () => await seederContract.connect(seeder1).redeem(seeder1Units),
      "RESERVE_BALANCE",
      "did not prevent redemption before approved seederPay was pulled"
    );

    // seeder1 pulls erc20 into SeedERC20 contract
    await seederContract
      .connect(seeder1)
      .pullERC20(
        reserve.address,
        await reserve.allowance(trust.address, seeder)
      );

    // seeders redeem funds
    await seederContract.connect(seeder1).redeem(seeder1Units);
    await seederContract.connect(seeder2).redeem(seeder2Units);

    // before reserve funds pulled into RedeemableERC20
    await Util.assertError(
      async () =>
        await token
          .connect(signer1)
          .redeem([reserve.address], await token.balanceOf(signer1.address)),
      "ZERO_TRANSFER",
      "RedeemableERC20 did not protect redeemer, should have checked for non-zero balance for every treasury asset"
    );

    // signer1 pulls erc20 into RedeemableERC20 contract
    await token
      .connect(signer1)
      .pullERC20(
        reserve.address,
        await reserve.allowance(trust.address, token.address)
      );

    const signer1ReserveBefore = await reserve.balanceOf(signer1.address);
    const signer1TokensBefore = await token.balanceOf(signer1.address);

    assert(
      !signer1TokensBefore.isZero(),
      "expected non-zero redeemable token amount for signer1"
    );

    // signer1 can now safely redeem all redeemable tokens
    await token.connect(signer1).redeem([reserve.address], signer1TokensBefore);

    const signer1ReserveAfter = await reserve.balanceOf(signer1.address);
    const signer1TokensAfter = await token.balanceOf(signer1.address);

    assert(
      signer1TokensAfter.isZero(),
      "expected zero redeemable token amount for signer1 after redemption (as normal)"
    );
    assert(
      signer1ReserveAfter.gt(signer1ReserveBefore),
      "signer1 did not gain reserve tokens after redeeming their RedeemablERC20 balance"
    );
  });

  describe("should support creatorFundsRelease escape hatch", async function () {
    it("in phase TWO", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      assert(
        (await trust.currentPhase()) === Phase.ZERO,
        `wrong phase (assert no. 0)
        expected  ${Phase.ZERO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 0"
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      ) as ReserveToken & Contract;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      assert(
        (await trust.currentPhase()) === Phase.ZERO,
        `wrong phase (assert no. 1)
        expected  ${Phase.ZERO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 0"
      );

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      await trust.startDutchAuction({ gasLimit: 100000000 });

      assert(
        (await trust.currentPhase()) === Phase.ONE,
        `wrong phase (assert no. 2)
        expected  ${Phase.ONE}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 1"
      );

      const startBlock = await ethers.provider.getBlockNumber();

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await crpSigner.pokeWeights();
        await reserveSigner.approve(bPool.address, spend);
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(signer1, reserveSpend);
      }

      assert(
        (await trust.currentPhase()) === Phase.ONE,
        `wrong phase (assert no. 3)
        expected  ${Phase.ONE}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 1"
      );

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.currentPhase()) === Phase.TWO,
        `wrong phase (assert no. 4)
        expected  ${Phase.TWO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "EARLY_RELEASE",
        "anon wrongly set creator funds in Phase.TWO before creatorFundsReleaseTimeout complete"
      );

      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);

      assert(
        (await trust.currentPhase()) === Phase.TWO,
        `wrong phase (assert no. 5)
        expected  ${Phase.TWO}
        got       ${await trust.currentPhase()}`
      );

      // schedule Phase.FOUR immediately
      await trust.connect(signer1).enableCreatorFundsRelease();

      assert(
        (await trust.currentPhase()) === Phase.FOUR,
        `wrong phase (assert no. 6)
        expected  ${Phase.FOUR}
        got       ${await trust.currentPhase()}`
      );

      await Util.assertError(
        async () => await trust.endDutchAuction(),
        "BAD_PHASE",
        "ended dutch auction despite moving to creator funds release phase"
      );

      await Util.assertError(
        async () =>
          await trust
            .connect(signer1)
            .creatorFundsRelease(
              reserve.address,
              await reserve.balanceOf(trust.address)
            ),
        "NON_CREATOR_RELEASE",
        "non-creator wrongly called creatorFundsRelease"
      );

      const reserveTrustBefore = await reserve.balanceOf(trust.address);
      const tokenTrustBefore = await token.balanceOf(trust.address);
      const crpTrustBefore = await crp.balanceOf(trust.address);
      const reserveCreatorBefore = await reserve.balanceOf(creator.address);
      const tokenCreatorBefore = await token.balanceOf(creator.address);
      const crpCreatorBefore = await crp.balanceOf(creator.address);

      console.log({
        reserveTrustBefore,
        tokenTrustBefore,
        crpTrustBefore,
        reserveCreatorBefore,
        tokenCreatorBefore,
        crpCreatorBefore,
      });

      // approve all for transfer
      await trust
        .connect(creator)
        .creatorFundsRelease(reserve.address, reserveTrustBefore);
      await trust
        .connect(creator)
        .creatorFundsRelease(token.address, tokenTrustBefore);
      await trust
        .connect(creator)
        .creatorFundsRelease(crp.address, crpTrustBefore);

      // perform transfers
      await reserve
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await reserve.allowance(trust.address, creator.address)
        );
      await token
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await token.allowance(trust.address, creator.address)
        );
      await crp
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await crp.allowance(trust.address, creator.address)
        );

      const reserveTrustAfter = await reserve.balanceOf(trust.address);
      const tokenTrustAfter = await token.balanceOf(trust.address);
      const crpTrustAfter = await crp.balanceOf(trust.address);
      const reserveCreatorAfter = await reserve.balanceOf(creator.address);
      const tokenCreatorAfter = await token.balanceOf(creator.address);
      const crpCreatorAfter = await crp.balanceOf(creator.address);

      console.log({
        reserveTrustAfter,
        tokenTrustAfter,
        crpTrustAfter,
        reserveCreatorAfter,
        tokenCreatorAfter,
        crpCreatorAfter,
      });

      // everything on trust should be drained
      assert(reserveTrustAfter.isZero(), "unspecified assert 0");
      assert(tokenTrustAfter.isZero(), "unspecified assert 1");
      assert(crpTrustAfter.isZero(), "unspecified assert 2");

      // creator should receive full amount
      assert(
        reserveCreatorAfter.eq(reserveTrustBefore.add(reserveCreatorBefore)),

        "unspecified assert 3"
      );
      assert(
        tokenCreatorAfter.eq(tokenTrustBefore.add(tokenCreatorBefore)),
        "unspecified assert 4"
      );
      assert(
        crpCreatorAfter.eq(crpTrustBefore.add(crpCreatorBefore)),
        "unspecified assert 5"
      );
    });

    it("in phase THREE", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      assert(
        (await trust.currentPhase()) === Phase.ZERO,
        `wrong phase (assert no. 0)
        expected  ${Phase.ZERO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 0"
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      ) as ReserveToken & Contract;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      assert(
        (await trust.currentPhase()) === Phase.ZERO,
        `wrong phase (assert no. 1)
        expected  ${Phase.ZERO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 0"
      );

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      await trust.startDutchAuction({ gasLimit: 100000000 });

      assert(
        (await trust.currentPhase()) === Phase.ONE,
        `wrong phase (assert no. 2)
        expected  ${Phase.ONE}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 1"
      );

      const startBlock = await ethers.provider.getBlockNumber();

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await crpSigner.pokeWeights();
        await reserveSigner.approve(bPool.address, spend);
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(signer1, reserveSpend);
      }

      assert(
        (await trust.currentPhase()) === Phase.ONE,
        `wrong phase (assert no. 3)
        expected  ${Phase.ONE}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "UNSUPPORTED_FUNDS_RELEASE",
        "anon wrongly set creator funds for release in phase 1"
      );

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.currentPhase()) === Phase.TWO,
        `wrong phase (assert no. 4)
        expected  ${Phase.TWO}
        got       ${await trust.currentPhase()}`
      );
      // anon attempts to set creator funds for release
      await Util.assertError(
        async () => await trust.connect(signer1).enableCreatorFundsRelease(),
        "EARLY_RELEASE",
        "anon wrongly set creator funds in Phase.TWO before creatorFundsReleaseTimeout complete"
      );

      assert(
        (await trust.currentPhase()) === Phase.TWO,
        `wrong phase (assert no. 5)
        expected  ${Phase.TWO}
        got       ${await trust.currentPhase()}`
      );

      await trust.endDutchAuction();

      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);

      assert(
        (await trust.currentPhase()) === Phase.THREE,
        `wrong phase (assert no. 6)
        expected  ${Phase.THREE}
        got       ${await trust.currentPhase()}`
      );

      // schedule Phase.FOUR after Phase.THREE
      await trust.connect(signer1).enableCreatorFundsRelease();

      assert(
        (await trust.currentPhase()) === Phase.FOUR,
        `wrong phase (assert no. 7)
        expected  ${Phase.FOUR}
        got       ${await trust.currentPhase()}`
      );

      await Util.assertError(
        async () =>
          await trust
            .connect(signer1)
            .creatorFundsRelease(
              reserve.address,
              await reserve.balanceOf(trust.address)
            ),
        "NON_CREATOR_RELEASE",
        "non-creator wrongly called creatorFundsRelease"
      );

      const reserveTrustBefore = await reserve.balanceOf(trust.address);
      const tokenTrustBefore = await token.balanceOf(trust.address);
      const crpTrustBefore = await crp.balanceOf(trust.address);
      const reserveCreatorBefore = await reserve.balanceOf(creator.address);
      const tokenCreatorBefore = await token.balanceOf(creator.address);
      const crpCreatorBefore = await crp.balanceOf(creator.address);

      console.log({
        reserveTrustBefore,
        tokenTrustBefore,
        crpTrustBefore,
        reserveCreatorBefore,
        tokenCreatorBefore,
        crpCreatorBefore,
      });

      // approve all for transfer
      await trust
        .connect(creator)
        .creatorFundsRelease(reserve.address, reserveTrustBefore);
      await trust
        .connect(creator)
        .creatorFundsRelease(token.address, tokenTrustBefore);
      await trust
        .connect(creator)
        .creatorFundsRelease(crp.address, crpTrustBefore);

      // perform transfers
      await reserve
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await reserve.allowance(trust.address, creator.address)
        );
      await token
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await token.allowance(trust.address, creator.address)
        );
      await crp
        .connect(creator)
        .transferFrom(
          trust.address,
          creator.address,
          await crp.allowance(trust.address, creator.address)
        );

      const reserveTrustAfter = await reserve.balanceOf(trust.address);
      const tokenTrustAfter = await token.balanceOf(trust.address);
      const crpTrustAfter = await crp.balanceOf(trust.address);
      const reserveCreatorAfter = await reserve.balanceOf(creator.address);
      const tokenCreatorAfter = await token.balanceOf(creator.address);
      const crpCreatorAfter = await crp.balanceOf(creator.address);

      console.log({
        reserveTrustAfter,
        tokenTrustAfter,
        crpTrustAfter,
        reserveCreatorAfter,
        tokenCreatorAfter,
        crpCreatorAfter,
      });

      // everything on trust should be drained
      assert(reserveTrustAfter.isZero(), "unspecified assert 0");
      assert(tokenTrustAfter.isZero(), "unspecified assert 1");
      assert(crpTrustAfter.isZero(), "unspecified assert 2");

      // creator should receive full amount
      assert(
        reserveCreatorAfter.eq(reserveTrustBefore.add(reserveCreatorBefore)),

        "unspecified assert 3"
      );
      assert(
        tokenCreatorAfter.eq(tokenTrustBefore.add(tokenCreatorBefore)),
        "unspecified assert 4"
      );
      assert(
        crpCreatorAfter.eq(crpTrustBefore.add(crpCreatorBefore)),
        "unspecified assert 5"
      );
    });
  });

  it("should end raise with non-zero minimum tier where the BPool is a RedeemableERC20 token recipient as it is about to become a token distributor", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from(10 ** 8); // just passes RESERVE_INIT_MINIMUM
    const redeemInit = ethers.BigNumber.from(10 ** 8);
    const initialValuation = ethers.BigNumber.from(10 ** 9);
    const totalTokenSupply = ethers.BigNumber.from("1" + Util.eighteenZeros); // minimum total supply also

    const minimumCreatorRaise = ethers.BigNumber.from("1");
    const seederFee = ethers.BigNumber.from("1");
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: seeder.address,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const reserveSpend = successLevel.div(10);
    const tokenSpend = ethers.BigNumber.from("10000000000");

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const swapTokensForReserve = async (signer, spend) => {
      await crp.connect(signer).pokeWeights();
      await token.connect(signer).approve(bPool.address, spend);
      await bPool
        .connect(signer)
        .swapExactAmountIn(
          token.address,
          tokenSpend,
          reserve.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("10000000000000000000000000000")
        );
    };

    await swapReserveForTokens(signer1, reserveSpend);

    // Check we can sell tokens back despite the Tier requirement.
    await swapTokensForReserve(signer1, tokenSpend);

    // reach success level
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    await trust.endDutchAuction();
  });

  it("should exit with absolute minimum token balance when using min reserve init", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from(10 ** 8); // just passes RESERVE_INIT_MINIMUM
    const redeemInit = ethers.BigNumber.from(10 ** 8);
    const initialValuation = ethers.BigNumber.from(10 ** 9);
    const totalTokenSupply = ethers.BigNumber.from("1" + Util.eighteenZeros); // minimum total supply also

    const minimumCreatorRaise = ethers.BigNumber.from("1");
    const seederFee = ethers.BigNumber.from("1");
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: seeder.address,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const reserveSpend = successLevel.div(10);

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    // reach success level
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    await trust.endDutchAuction();
  });

  it("blocks small token balance", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2001");
    const redeemInit = ethers.BigNumber.from("2001");
    const initialValuation = ethers.BigNumber.from("10001");
    const totalTokenSupply = ethers.BigNumber.from("2001" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("101");
    const seederFee = ethers.BigNumber.from("101");
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

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
            minimumStatus,
            totalSupply: totalTokenSupply,
          },
          {
            seeder: seeder.address,
            seederUnits,
            seederCooldownDuration,
            seedERC20Config,
            seedERC20Factory: seedERC20Factory.address,
          },
          { gasLimit: 100000000 }
        ),
      `RESERVE_INIT_MINIMUM`,
      `failed to protect against large dust`
    );
  });

  it("supports precision of ten zeros", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2001" + Util.tenZeros);
    const redeemInit = ethers.BigNumber.from("2001" + Util.tenZeros);
    const initialValuation = ethers.BigNumber.from("10001" + Util.tenZeros);
    const totalTokenSupply = ethers.BigNumber.from("2001" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("101" + Util.tenZeros);
    const seederFee = ethers.BigNumber.from("101" + Util.tenZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: seeder.address,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const reserveSpend = successLevel.div(10);

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    // reach success level
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    await trust.endDutchAuction();
  });

  describe("should update distribution status correctly", async function () {
    it("on successful distribution", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.PENDING,
        `distribution status not pending`
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      ) as ReserveToken & Contract;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.SEEDED,
        `distribution status not seeded`
      );

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      await trust.startDutchAuction({ gasLimit: 100000000 });

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.TRADING,
        `distribution status not trading`
      );

      const startBlock = await ethers.provider.getBlockNumber();

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await crpSigner.pokeWeights();
        await reserveSigner.approve(bPool.address, spend);
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(signer1, reserveSpend);
      }

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.TRADINGCANEND,
        `distribution status not trading can end`
      );

      const expectedTrustFinalBalance = await reserve.balanceOf(bPool.address);

      await trust.endDutchAuction();

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.SUCCESS,
        "distribution status not successful distribution"
      );

      assert(
        (await trust.finalBalance()).eq(expectedTrustFinalBalance),
        "finalBalance was not exposed after trading ended (successful distribution)"
      );
    });

    it("on failed distribution", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
        },
        { gasLimit: 100000000 }
      );

      await trust.deployed();

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.PENDING,
        "distribution status was not set to pending"
      );

      // seeder needs some cash, give enough to seeder
      await reserve.transfer(seeder.address, reserveInit);

      const reserveSeeder = new ethers.Contract(
        reserve.address,
        reserve.interface,
        seeder
      ) as ReserveToken & Contract;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.SEEDED,
        `distribution status not set to seeded`
      );

      await trust.startDutchAuction({ gasLimit: 100000000 });

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.TRADING,
        "distribution status was not set to trading"
      );

      const startBlock = await ethers.provider.getBlockNumber();

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.TRADINGCANEND,
        `distribution status not trading can end`
      );

      const [, bPool] = await Util.poolContracts(signers, trust);

      const expectedTrustFinalBalance = await reserve.balanceOf(bPool.address);

      await trust.endDutchAuction();

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.FAIL,
        "distribution status was failed"
      );

      assert(
        (await trust.finalBalance()).eq(expectedTrustFinalBalance),
        "finalBalance was not exposed after trading ended (failed distribution)"
      );
    });
  });

  it("should burn all unsold tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

    const successLevel = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
    const finalValuation = successLevel;

    const minimumTradingDuration = 50;

    const trustFactoryDeployer = trustFactory.connect(deployer);

    await tier.setTier(signer1.address, Tier.GOLD, []);

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: seeder.address,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    // seeder must transfer funds before pool can init
    await reserveSeeder.transfer(trust.address, reserveInit);

    const token = new ethers.Contract(
      await trust.token(),
      redeemableTokenJson.abi,
      creator
    ) as RedeemableERC20 & Contract;

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const reserveSpend = successLevel.div(10);

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    // reach success level
    while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    const swappedTokens = await token.balanceOf(signer1.address);

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    await trust.endDutchAuction();

    const totalSupply = await token.totalSupply();

    assert(
      totalSupply.eq(swappedTokens),
      `remaining supply of tokens was not equal to number that were sold
      remaining supply ${totalSupply}
      swapped          ${swappedTokens}
    `
    );
  });

  it("should exit with minimal reserve dust remaining", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator
    const deployer = signers[2]; // deployer is not creator

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

    const { trustFactory, seedERC20Factory } = await factoriesDeploy(
      crpFactory,
      bFactory
    );

    const erc20Config = { name: "Token", symbol: "TKN" };
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 0;

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
        minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        seeder: seeder.address,
        seederUnits,
        seederCooldownDuration,
        seedERC20Config,
        seedERC20Factory: seedERC20Factory.address,
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

    // seeder must transfer seed funds before pool can init
    await reserveSeeder.transfer(trust.address, reserveInit);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const [, bPool] = await Util.poolContracts(signers, trust);

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address);

    assert(
      bPoolReserveBeforeExit.eq(reserveInit),
      "wrong amount of reserve in balancer pool"
    );

    await trust.endDutchAuction();

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);

    const expectedDust = Util.estimateReserveDust(bPoolReserveAfterExit)
      // intentional dust
      .add(1)
      // rounding dust
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

  describe("should only pay out creator if minimum distribution met", async function () {
    it("when minimum distribution met", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
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

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      await trust.startDutchAuction({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await crpSigner.pokeWeights();
        await reserveSigner.approve(bPool.address, spend);
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      // reach success level
      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(signer1, reserveSpend);
      }

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      const creatorBalanceBeforeEndAuction = await reserve.balanceOf(
        creator.address
      );

      await trust.endDutchAuction();

      const creatorBalanceAfterEndAuction = await reserve.balanceOf(
        creator.address
      );

      assert(
        creatorBalanceBeforeEndAuction.eq(creatorBalanceAfterEndAuction),
        "creator balance did not remain unchanged"
      );

      const allowance = await reserve.allowance(trust.address, creator.address);

      const creatorBalanceBefore = await reserve.balanceOf(creator.address);

      // creator retrieves creatorPay
      await reserve
        .connect(creator)
        .transferFrom(trust.address, creator.address, allowance);

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        !creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly did not receive payout after successful distribution"
      );
    });

    it("when minimum distribution not met", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
      const minimumStatus = Tier.GOLD;

      const { trustFactory, seedERC20Factory } = await factoriesDeploy(
        crpFactory,
        bFactory
      );

      const erc20Config = { name: "Token", symbol: "TKN" };
      const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const initialValuation = ethers.BigNumber.from("10000" + Util.sixZeros);
      const totalTokenSupply = ethers.BigNumber.from(
        "2000" + Util.eighteenZeros
      );

      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederUnits = 0;
      const seederCooldownDuration = 0;

      const successLevel = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
      const finalValuation = successLevel;

      const minimumTradingDuration = 50;

      const trustFactoryDeployer = trustFactory.connect(deployer);

      await tier.setTier(signer1.address, Tier.GOLD, []);

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
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: seeder.address,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
          seedERC20Factory: seedERC20Factory.address,
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

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(trust.address, reserveInit);

      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20 & Contract;

      await trust.startDutchAuction({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      const [crp, bPool] = await Util.poolContracts(signers, trust);

      const reserveSpend = successLevel.div(10);

      const swapReserveForTokens = async (signer, spend) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);

        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);

        await crpSigner.pokeWeights();
        await reserveSigner.approve(bPool.address, spend);
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };

      // failed to reach success level
      // while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
      await swapReserveForTokens(signer1, reserveSpend);
      // }

      // create empty transfer blocks until reaching next phase, so distribution can end
      while (
        (await ethers.provider.getBlockNumber()) <=
        startBlock + minimumTradingDuration
      ) {
        await reserve.transfer(signers[9].address, 0);
      }

      const creatorBalanceBefore = await reserve.balanceOf(creator.address);

      await trust.endDutchAuction();

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly received payout after failed distribution"
      );
    });
  });
});
