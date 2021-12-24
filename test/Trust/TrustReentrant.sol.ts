/* eslint-disable @typescript-eslint/no-var-requires */
import chai from "chai";
import * as Util from "../Util";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { TrustReentrant } from "../../typechain/TrustReentrant";
import { factoriesDeploy } from "../Util";
import type { Contract } from "ethers";
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

const seedERC20Json = require("../../artifacts/contracts/seed/SeedERC20.sol/SeedERC20.json");
const redeemableTokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");

describe("TrustReentrant", async function () {
  it("should guard against reentrancy when ending raise if primary reserve is malicious", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const creator = signers[0];
    const deployer = signers[1]; // deployer is not creator
    const seeder1 = signers[2];
    const seeder2 = signers[3];
    const signer1 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const maliciousReserve = (await Util.basicDeploy(
      "TrustReentrant",
      {}
    )) as TrustReentrant & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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
        reserve: maliciousReserve.address,
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
    await maliciousReserve.transfer(
      seeder1.address,
      seedPrice.mul(seeder1Units)
    );
    await maliciousReserve.transfer(
      seeder2.address,
      seedPrice.mul(seeder2Units)
    );

    const seederContract1 = seederContract.connect(seeder1);
    const seederContract2 = seederContract.connect(seeder2);
    const reserve1 = maliciousReserve.connect(seeder1);
    const reserve2 = maliciousReserve.connect(seeder2);

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units));
    await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units));

    // seeders send reserve to seeder contract
    await seederContract1.seed(0, seeder1Units);
    await seederContract2.seed(0, seeder2Units);

    // Recipient gains infinite approval on reserve token withdrawals from seed contract
    await maliciousReserve.allowance(seederContract.address, recipient);

    await trust.startDutchAuction({ gasLimit: 100000000 });

    const [crp, bPool] = await Util.poolContracts(signers, trust);

    const startBlock = await ethers.provider.getBlockNumber();

    const reserveSpend = finalValuation.div(10);

    // signer1 fully funds raise
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

    while (
      (await maliciousReserve.balanceOf(bPool.address)).lte(successLevel)
    ) {
      await swapReserveForTokens(signer1, reserveSpend);
    }

    await Util.createEmptyBlock(
      startBlock +
        minimumTradingDuration -
        (await ethers.provider.getBlockNumber())
    );

    await Util.assertError(
      async () =>
        // seeder1 ends raise
        await trust.connect(seeder1).endDutchAuctionAndTransfer(),
      "ReentrancyGuard: reentrant call",
      "did not guard against reentrancy attack"
    );
  });
});
