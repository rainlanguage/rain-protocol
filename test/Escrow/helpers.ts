import * as Util from "../Util";
import { ethers } from "hardhat";
import type { BPoolFeeEscrow } from "../../typechain/BPoolFeeEscrow";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";

const poolJson = require("../../artifacts/contracts/pool/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const tokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");

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

export const deployGlobals = async () => {
  const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

  const tierFactory = await ethers.getContractFactory("ReadWriteTier");
  const tier = (await tierFactory.deploy()) as ReadWriteTier;

  const { trustFactory } = await Util.factoriesDeploy(
    rightsManager,
    crpFactory,
    bFactory
  );

  // Deploy global Escrow contract
  const escrowFactory = await ethers.getContractFactory("BPoolFeeEscrow");
  const escrow = (await escrowFactory.deploy(
    trustFactory.address
  )) as BPoolFeeEscrow;

  return {
    rightsManager,
    crpFactory,
    bFactory,
    tierFactory,
    tier,
    trustFactory,
    escrowFactory,
    escrow,
  };
};

export const basicSetup = async (signers, trustFactory, tier) => {
  const reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken;

  const minimumStatus = Tier.NIL;
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
  const recipient = signers[3];
  const signer1 = signers[4];

  const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
  const seederUnits = 0;
  const seederCooldownDuration = 0;

  const successLevel = reserveInit
    .add(seederFee)
    .add(redeemInit)
    .add(minimumCreatorRaise);

  const minimumTradingDuration = 100;

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

  // seeder needs some cash, give enough to seeder
  await reserve.transfer(seeder.address, reserveInit);

  const reserveSeeder = new ethers.Contract(
    reserve.address,
    reserve.interface,
    seeder
  ) as ReserveToken;

  const redeemableERC20Address = await trust.token();
  const poolAddress = await trust.pool();

  const redeemableERC20 = new ethers.Contract(
    redeemableERC20Address,
    tokenJson.abi,
    creator
  ) as RedeemableERC20;
  const pool = new ethers.Contract(
    poolAddress,
    poolJson.abi,
    creator
  ) as RedeemableERC20Pool;

  // seeder must transfer funds to pool
  await reserveSeeder.transfer(poolAddress, reserveInit);

  await pool.startDutchAuction({ gasLimit: 100000000 });

  // crp and bPool are now defined
  const [crp, bPool] = await Util.poolContracts(signers, pool);

  return {
    reserve,
    trust,
    recipient,
    signer1,
    successLevel,
    pool,
    crp,
    bPool,
    minimumTradingDuration,
    redeemableERC20,
  };
};

export const successfulRaise = async (signers) => {
  const { escrow, trustFactory, tier } = await deployGlobals();

  const {
    reserve,
    trust,
    recipient,
    signer1,
    successLevel,
    bPool,
    minimumTradingDuration,
  } = await basicSetup(signers, trustFactory, tier);

  const startBlock = await ethers.provider.getBlockNumber();

  const buyTokensViaEscrow = async (signer, spend, fee) => {
    // give signer some reserve
    await reserve.transfer(signer.address, spend.add(fee));

    await reserve.connect(signer).approve(escrow.address, spend.add(fee));

    await escrow
      .connect(signer)
      .buyToken(
        trust.address,
        spend,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros),
        recipient.address,
        fee
      );
  };

  const spend = ethers.BigNumber.from("250" + Util.sixZeros);
  const fee = ethers.BigNumber.from("10" + Util.sixZeros);

  // raise all necessary funds
  let buyCount = 0;
  while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
    await buyTokensViaEscrow(signer1, spend, fee);
    buyCount++;
  }

  const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
  const emptyBlocks =
    startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

  // create empty blocks to end of raise duration
  await Util.createEmptyBlock(emptyBlocks);

  // actually end raise
  await trust.anonEndDistribution();

  return {
    reserve,
    escrow,
    trust,
    recipient,
    signer1,
    successLevel,
    bPool,
    minimumTradingDuration,
    fee,
    buyCount,
  };
};
