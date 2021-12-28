/* eslint-disable @typescript-eslint/no-var-requires */
import * as Util from "../Util";
import { ethers } from "hardhat";
import type { BPoolFeeEscrow } from "../../typechain/BPoolFeeEscrow";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { TrustFactory } from "../../typechain/TrustFactory";
import type { BigNumber, Contract } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { SeedERC20Factory } from "../../typechain/SeedERC20Factory";
import { getAddress } from "ethers/lib/utils";
import { expect } from "chai";

const tokenJson = require("../../artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json");
const escrowJson = require("../../artifacts/contracts/escrow/BPoolFeeEscrow.sol/BPoolFeeEscrow.json");

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

export const deployGlobals = async () => {
  const [crpFactory, bFactory] = await Util.balancerDeploy();

  const tierFactory = await ethers.getContractFactory("ReadWriteTier");
  const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;

  const { trustFactory, seedERC20Factory } = await Util.factoriesDeploy(
    crpFactory,
    bFactory
  );

  return {
    crpFactory,
    bFactory,
    tierFactory,
    tier,
    trustFactory,
    seedERC20Factory,
  };
};

export const basicSetup = async (
  signers: SignerWithAddress[],
  trustFactory: TrustFactory & Contract,
  seedERC20Factory: SeedERC20Factory & Contract,
  tier: ReadWriteTier & Contract
) => {
  const reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
    Contract;

  const minimumStatus = Tier.GOLD;
  const erc20Config = { name: "Token", symbol: "TKN" };
  const seedERC20Config = { name: "SeedToken", symbol: "SDT" };

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

  const redeemableERC20Address = await trust.token();

  const redeemableERC20 = new ethers.Contract(
    redeemableERC20Address,
    tokenJson.abi,
    creator
  ) as RedeemableERC20 & Contract;
  const bPoolFeeEscrow = new ethers.Contract(
    await trust.bPoolFeeEscrow(),
    escrowJson.abi,
    creator
  ) as BPoolFeeEscrow & Contract;

  // seeder must transfer funds to trust
  await reserveSeeder.transfer(trust.address, reserveInit);

  await trust.startDutchAuction({ gasLimit: 100000000 });

  // crp and bPool are now defined
  const [crp, bPool] = await Util.poolContracts(signers, trust);

  return {
    reserve,
    trust,
    recipient,
    signer1,
    successLevel,
    crp,
    bPool,
    minimumTradingDuration,
    redeemableERC20,
    bPoolFeeEscrow,
  };
};

export const successfulRaise = async (
  signers: SignerWithAddress[],
  trustFactory: TrustFactory & Contract,
  seedERC20Factory: SeedERC20Factory & Contract,
  tier: ReadWriteTier & Contract
) => {
  const {
    reserve,
    trust,
    recipient,
    signer1,
    successLevel,
    crp,
    bPool,
    minimumTradingDuration,
    redeemableERC20,
    bPoolFeeEscrow,
  } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

  const startBlock = await ethers.provider.getBlockNumber();

  const buyTokensViaEscrow = async (
    signer: SignerWithAddress,
    spend: BigNumber,
    fee: BigNumber
  ) => {
    // give signer some reserve
    await reserve.transfer(signer.address, spend.add(fee));

    await reserve
      .connect(signer)
      .approve(bPoolFeeEscrow.address, spend.add(fee));

    const buyTokenPromise = bPoolFeeEscrow
      .connect(signer)
      .buyToken(
        recipient.address,
        trust.address,
        fee,
        spend,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );

    // Fee event
    await expect(buyTokenPromise)
      .to.emit(bPoolFeeEscrow, "Fee")
      .withArgs(recipient.address, getAddress(trust.address), fee);
  };

  const spend = ethers.BigNumber.from("250" + Util.sixZeros);
  const fee = ethers.BigNumber.from("10" + Util.sixZeros);

  // raise all necessary funds
  let buyCount = 0;
  while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
    await buyTokensViaEscrow(signer1, spend, fee);
    buyCount++;
  }

  const totalSpend = spend.mul(buyCount);
  const totalFee = fee.mul(buyCount);

  const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
  const emptyBlocks =
    startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

  // create empty blocks to end of raise duration
  await Util.createEmptyBlock(emptyBlocks);

  // actually end raise
  await trust.endDutchAuction();

  return {
    reserve,
    bPoolFeeEscrow,
    trust,
    recipient,
    signer1,
    successLevel,
    bPool,
    minimumTradingDuration,
    fee,
    buyCount,
    totalSpend,
    totalFee,
    crp,
    redeemableERC20,
    spend,
  };
};

export const failedRaise = async (
  signers: SignerWithAddress[],
  trustFactory: TrustFactory & Contract,
  seedERC20Factory: SeedERC20Factory & Contract,
  tier: ReadWriteTier & Contract
) => {
  const {
    reserve,
    trust,
    recipient,
    signer1,
    successLevel,
    bPool,
    minimumTradingDuration,
    crp,
    redeemableERC20,
    bPoolFeeEscrow,
  } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

  const startBlock = await ethers.provider.getBlockNumber();

  const buyTokensViaEscrow = async (
    signer: SignerWithAddress,
    spend: BigNumber,
    fee: BigNumber
  ) => {
    // give signer some reserve
    await reserve.transfer(signer.address, spend.add(fee));

    await reserve
      .connect(signer)
      .approve(bPoolFeeEscrow.address, spend.add(fee));

    const buyTokenPromise = bPoolFeeEscrow
      .connect(signer)
      .buyToken(
        recipient.address,
        trust.address,
        fee,
        spend,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.eighteenZeros)
      );

    // Fee event
    await expect(buyTokenPromise)
      .to.emit(bPoolFeeEscrow, "Fee")
      .withArgs(recipient.address, getAddress(trust.address), fee);
  };

  const spend = ethers.BigNumber.from("250" + Util.sixZeros);
  const fee = ethers.BigNumber.from("10" + Util.sixZeros);

  // raise all necessary funds
  await buyTokensViaEscrow(signer1, spend, fee);

  const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
  const emptyBlocks =
    startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

  // create empty blocks to end of raise duration
  await Util.createEmptyBlock(emptyBlocks);

  // actually end raise
  await trust.endDutchAuction();

  return {
    reserve,
    bPoolFeeEscrow,
    trust,
    recipient,
    signer1,
    successLevel,
    bPool,
    minimumTradingDuration,
    fee,
    spend,
    crp,
    redeemableERC20,
  };
};
