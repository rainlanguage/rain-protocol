import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../../typechain/Trust";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../Util";
import { utils } from "ethers";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import type { SeedERC20 } from "../../typechain/SeedERC20";
import { factoriesDeploy } from "../Util";

chai.use(solidity);
const { expect, assert } = chai;

const trustJson = require("../../artifacts/contracts/trust/Trust.sol/Trust.json");
const poolJson = require("../../artifacts/contracts/pool/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const bPoolJson = require("@beehiveinnovation/configurable-rights-pool/artifacts/BPool.json");
const reserveJson = require("../../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json");
const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");
const crpJson = require("../../artifacts/contracts/pool/IConfigurableRightsPool.sol/IConfigurableRightsPool.json");

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

describe("TrustDistribute", async function () {
  it("should end distribution if minimum tier is non-zero", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.SILVER;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
    const finalValuation = successLevel;

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
        finalValuation,
        minimumTradingDuration,
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

    // seeder must transfer seed funds before pool can init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    // create empty transfer blocks until reaching next phase, so distribution can end
    while (
      (await ethers.provider.getBlockNumber()) <=
      startBlock + minimumTradingDuration
    ) {
      await reserve.transfer(signers[9].address, 0);
    }

    await trust.anonEndDistribution();
  });

  it("should exit with absolute minimum token balance when using min reserve init", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from(10 ** 8); // just passes RESERVE_INIT_MINIMUM
    const redeemInit = ethers.BigNumber.from(10 ** 8);
    const initialValuation = ethers.BigNumber.from(10 ** 9);
    const totalTokenSupply = ethers.BigNumber.from("1" + Util.eighteenZeros); // minimum total supply also

    const minimumCreatorRaise = ethers.BigNumber.from("1");
    const seederFee = ethers.BigNumber.from("1");
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
    const finalValuation = successLevel;

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
        finalValuation,
        minimumTradingDuration,
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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    let [crp, bPool] = await Util.poolContracts(signers, pool);

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

    await trust.anonEndDistribution();
  });

  it("blocks small token balance", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2001");
    const redeemInit = ethers.BigNumber.from("2001");
    const initialValuation = ethers.BigNumber.from("10001");
    const totalTokenSupply = ethers.BigNumber.from("2001" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("101");
    const seederFee = ethers.BigNumber.from("101");
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
            finalValuation,
            minimumTradingDuration,
          },
          { gasLimit: 100000000 }
        ),
      `revert RESERVE_INIT_MINIMUM`,
      `failed to protect against large dust`
    );
  });

  it("supports precision of ten zeros", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

    const tokenName = "Token";
    const tokenSymbol = "TKN";

    const reserveInit = ethers.BigNumber.from("2001" + Util.tenZeros);
    const redeemInit = ethers.BigNumber.from("2001" + Util.tenZeros);
    const initialValuation = ethers.BigNumber.from("10001" + Util.tenZeros);
    const totalTokenSupply = ethers.BigNumber.from("2001" + Util.eighteenZeros);

    const minimumCreatorRaise = ethers.BigNumber.from("101" + Util.tenZeros);
    const seederFee = ethers.BigNumber.from("101" + Util.tenZeros);
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
    const finalValuation = successLevel;

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
        finalValuation,
        minimumTradingDuration,
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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    let [crp, bPool] = await Util.poolContracts(signers, pool);

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

    await trust.anonEndDistribution();
  });

  describe("should update distribution status correctly", async function () {
    it("on successful distribution", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const tokenName = "Token";
      const tokenSymbol = "TKN";

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

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

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
          finalValuation,
          minimumTradingDuration,
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
      ) as ReserveToken;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.SEEDED,
        `distribution status not seeded`
      );

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

      await pool.startDutchAuction({ gasLimit: 100000000 });

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.TRADING,
        `distribution status not trading`
      );

      const startBlock = await ethers.provider.getBlockNumber();

      let [crp, bPool] = await Util.poolContracts(signers, pool);

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

      await trust.anonEndDistribution();

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

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const tokenName = "Token";
      const tokenSymbol = "TKN";

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

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator

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
          finalValuation,
          minimumTradingDuration,
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
      ) as ReserveToken;

      // seeder must transfer seed funds before pool init
      await reserveSeeder.transfer(await trust.pool(), reserveInit);

      assert(
        (await trust.getDistributionStatus()) === RaiseStatus.SEEDED,
        `distribution status not set to seeded`
      );

      const pool = new ethers.Contract(
        await trust.pool(),
        poolJson.abi,
        creator
      ) as RedeemableERC20Pool;

      await pool.startDutchAuction({ gasLimit: 100000000 });

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

      let [crp, bPool] = await Util.poolContracts(signers, pool);

      const expectedTrustFinalBalance = await reserve.balanceOf(bPool.address);

      await trust.anonEndDistribution();

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

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
    const signer1 = signers[3];

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
        finalValuation,
        minimumTradingDuration,
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

    // seeder must transfer funds before pool can init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

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

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    let [crp, bPool] = await Util.poolContracts(signers, pool);

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

    await trust.anonEndDistribution();

    const tokenBPoolBalanceAfter = await token.balanceOf(bPool.address);

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

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier;
    const minimumStatus = Tier.NIL;

    const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

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
    const finalValuation = successLevel;

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
        finalValuation,
        minimumTradingDuration,
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

    // seeder must transfer seed funds before pool can init
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    const pool = new ethers.Contract(
      await trust.pool(),
      poolJson.abi,
      creator
    ) as RedeemableERC20Pool;

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    let [crp, bPool] = await Util.poolContracts(signers, pool);

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

    await trust.anonEndDistribution();

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);

    const expectedDust = Util.estimateReserveDust(bPoolReserveAfterExit).add(1);

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

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const tokenName = "Token";
      const tokenSymbol = "TKN";

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

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

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
          finalValuation,
          minimumTradingDuration,
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

      await pool.startDutchAuction({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      let [crp, bPool] = await Util.poolContracts(signers, pool);

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

      const creatorBalanceBefore = await reserve.balanceOf(creator.address);

      await trust.anonEndDistribution();

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        !creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly did not receive payout after successful distribution"
      );
    });

    it("when minimum distribution not met", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const [crpFactory, bFactory] = await Util.balancerDeploy();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken;

      const tierFactory = await ethers.getContractFactory("ReadWriteTier");
      const tier = (await tierFactory.deploy()) as ReadWriteTier;
      const minimumStatus = Tier.NIL;

      const { trustFactory } = await factoriesDeploy(crpFactory, bFactory);

      const tokenName = "Token";
      const tokenSymbol = "TKN";

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

      const creator = signers[0];
      const seeder = signers[1]; // seeder is not creator
      const deployer = signers[2]; // deployer is not creator
      const signer1 = signers[3];

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
          finalValuation,
          minimumTradingDuration,
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

      await pool.startDutchAuction({ gasLimit: 100000000 });

      const startBlock = await ethers.provider.getBlockNumber();

      let [crp, bPool] = await Util.poolContracts(signers, pool);

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

      await trust.anonEndDistribution();

      const creatorBalanceAfter = await reserve.balanceOf(creator.address);

      assert(
        creatorBalanceAfter.eq(creatorBalanceBefore),
        "creator wrongly received payout after failed distribution"
      );
    });
  });
});
