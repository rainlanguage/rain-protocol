import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers, artifacts } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TrustReentrant } from "../../typechain/TrustReentrant";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { BPool } from "../../typechain/BPool";
import type { SeedERC20Reentrant } from "../../typechain/SeedERC20Reentrant";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import type { ConfigurableRightsPool } from "../../typechain/ConfigurableRightsPool";
import { factoriesDeploy } from "../Util";
import type { Contract } from "ethers";

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

describe("TrustReentrant", async function () {
  it("should guard against reentrancy when ending raise if primary reserve is malicious", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const seeder = signers[1]; // seeder is not creator/owner
    const deployer = signers[2]; // deployer is not creator
    const signer1 = signers[3];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const maliciousReserve = (await Util.basicDeploy(
      "TrustReentrant",
      {}
    )) as TrustReentrant & Contract;

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
    const redeemInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 0;
    const seederCooldownDuration = 1;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

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
        reserve: maliciousReserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
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

    const token = new ethers.Contract(
      await trust.token(),
      (await artifacts.readArtifact("RedeemableERC20")).abi,
      creator
    ) as RedeemableERC20 & Contract;
    const pool = new ethers.Contract(
      await trust.pool(),
      (await artifacts.readArtifact("RedeemableERC20Pool")).abi,
      creator
    ) as RedeemableERC20Pool & Contract;
    const crp = new ethers.Contract(
      await pool.crp(),
      (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
      creator
    ) as ConfigurableRightsPool & Contract;

    await maliciousReserve.addReentrantTarget(trust.address);

    // seeder needs some cash, give enough to seeder
    await maliciousReserve.transfer(seeder.address, reserveInit);

    const reserveSeeder = new ethers.Contract(
      maliciousReserve.address,
      maliciousReserve.interface,
      seeder
    ) as SeedERC20Reentrant & Contract;

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit);

    await pool.startDutchAuction({ gasLimit: 100000000 });

    const startBlock = await ethers.provider.getBlockNumber();

    const bPool = new ethers.Contract(
      await crp.bPool(),
      (await artifacts.readArtifact("BPool")).abi,
      creator
    ) as BPool & Contract;

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await maliciousReserve.transfer(signer.address, spend);

      const reserveSigner = maliciousReserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await reserveSigner.approve(bPool.address, spend);
      await crpSigner.pokeWeights();
      await bPoolSigner.swapExactAmountIn(
        maliciousReserve.address,
        spend,
        token.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);

    while ((await maliciousReserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    while (
      (await ethers.provider.getBlockNumber()) <
      startBlock + minimumTradingDuration
    ) {
      await maliciousReserve.transfer(signers[3].address, 0);
    }

    await Util.assertError(
      async () => await trust.anonEndDistribution(),
      "ReentrancyGuard: reentrant call",
      "did not guard against reentrancy attack"
    );
  });
});
