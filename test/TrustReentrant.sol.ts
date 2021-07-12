import * as Util from "./Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { Prestige } from "../typechain/Prestige";
import type { TrustReentrant } from "../typechain/TrustReentrant";
import type { RedeemableERC20 } from "../typechain/RedeemableERC20";
import type { Trust } from "../typechain/Trust";
import type { BPool } from "../typechain/BPool";
import type { SeedERC20Reentrant } from "../typechain/SeedERC20Reentrant";

chai.use(solidity);
const { expect, assert } = chai;

const poolJson = require("../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const bPoolJson = require("../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json");
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

describe("TrustReentrant", async function () {
  it("should guard against reentrancy when ending raise if primary reserve is malicious", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const maliciousReserve = (await Util.basicDeploy(
      "TrustReentrant",
      {}
    )) as TrustReentrant;

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
    const seederCooldownDuration = 1;

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
        reserve: maliciousReserve.address,
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
    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator);
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator);

    await maliciousReserve.addReentrantTarget(trust.address);

    // seeder needs some cash, give enough to seeder
    await maliciousReserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      maliciousReserve.address,
      maliciousReserve.interface,
      seeder
    ) as SeedERC20Reentrant;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await trust.anonStartDistribution({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      bPoolJson.abi,
      creator
    ) as BPool;

    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await maliciousReserve.transfer(hodler.address, spend);

      const reserveHodler = maliciousReserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await reserveHodler.approve(bPool.address, spend);
      await crpHodler.pokeWeights();
      await bPoolHodler.swapExactAmountIn(
        maliciousReserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );
    };

    const spend = ethers.BigNumber.from("250" + Util.eighteenZeros);

    while ((await maliciousReserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(hodler1, spend);
    }

    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration
    ) {
      await maliciousReserve.transfer(signers[3].address, 0);
    }

    await Util.assertError(
      async () => await trust.anonEndDistribution(),
      "revert ReentrancyGuard: reentrant call",
      "did not guard against reentrancy attack"
    );
  });
});
