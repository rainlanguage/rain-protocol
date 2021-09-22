import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { BPoolFeeEscrow } from "../../typechain/BPoolFeeEscrow";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import type { Trust } from "../../typechain/Trust";
import type { BigNumber } from "ethers";
import type { ConfigurableRightsPool } from "../../typechain/ConfigurableRightsPool";
import type { BPool } from "../../typechain/BPool";

const poolJson = require("../../artifacts/contracts/pool/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");

chai.use(solidity);
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

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

interface SetupVars {
  signers: any[];
  reserve: ReserveToken;
  escrow: BPoolFeeEscrow;
  trust: Trust;
  recipient: any;
  signer1: any;
  successLevel: BigNumber;
  pool: RedeemableERC20Pool;
  crp: ConfigurableRightsPool;
  bPool: BPool;
  minimumTradingDuration: number;
}

const basicSetup = async (): Promise<SetupVars> => {
  const signers = await ethers.getSigners();

  const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

  const reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken;

  const tierFactory = await ethers.getContractFactory("ReadWriteTier");
  const tier = (await tierFactory.deploy()) as ReadWriteTier;
  const minimumStatus = Tier.NIL;

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

  const minimumTradingDuration = 50;

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

  const poolAddress = await trust.pool();

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
    signers,
    reserve,
    escrow,
    trust,
    recipient,
    signer1,
    successLevel,
    pool,
    crp,
    bPool,
    minimumTradingDuration,
  };
};

describe.only("BPoolFeeEscrow", async function () {
  it("should allow recipient to claim fees upon successful raise", async function () {
    this.timeout(0);

    const {
      reserve,
      escrow,
      trust,
      recipient,
      signer1,
      successLevel,
      bPool,
      minimumTradingDuration,
    } = await basicSetup();

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

    assert(
      (await trust.getDistributionStatus()) ===
        DistributionStatus.TRADINGCANEND,
      "raise incomplete"
    );

    // cannot claim before successful raise is closed
    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

    const reserveBalanceRecipient1 = await reserve.balanceOf(recipient.address);

    assert(
      reserveBalanceRecipient1.isZero(),
      `wrong recipient claim amount
      expected      0
      got           ${reserveBalanceRecipient1}
      reserveEscrow ${await reserve.balanceOf(escrow.address)}`
    );

    // actually end raise
    await trust.anonEndDistribution();

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "raise wasn't successful"
    );

    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

    const reserveBalanceRecipient2 = await reserve.balanceOf(recipient.address);

    // recipient should have claimed fees after calling `claimFees` after successful raise
    assert(
      reserveBalanceRecipient2.eq(fee.mul(buyCount)),
      `wrong recipient claim amount
      expected      ${fee.mul(buyCount)}
      got           ${reserveBalanceRecipient2}
      reserveEscrow ${await reserve.balanceOf(escrow.address)}`
    );
  });

  it("should allow front end user to buy tokens, and escrow takes a fee", async function () {
    this.timeout(0);

    const { signers, reserve, escrow, trust, recipient, signer1 } =
      await basicSetup();

    const startBlock = await ethers.provider.getBlockNumber();

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      const reserveSigner = reserve.connect(signer);

      await reserveSigner.approve(escrow.address, spend.add(fee));

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

    // signer1 uses a front end to buy token. Front end makes call to escrow contract so it takes a fee on behalf of recipient.
    await buyTokensViaEscrow(signer1, spend, fee);

    const reserveBalanceEscrow1 = await reserve.balanceOf(escrow.address);

    assert(
      reserveBalanceEscrow1.eq(fee),
      `wrong escrow reserve balance
      expected  ${fee}
      got       ${reserveBalanceEscrow1}`
    );

    // no-op claim if raise is still ongoing
    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

    const reserveBalanceRecipient1 = await reserve.balanceOf(recipient.address);

    assert(
      reserveBalanceRecipient1.isZero(),
      `wrong recipient reserve balance
      expected  0 (no fee claimed)
      got       ${reserveBalanceRecipient1}`
    );
  });

  describe("Modifiers", async function () {
    it("should check that trust address is child of trust factory", async function () {
      this.timeout(0);

      const { signers, reserve, escrow, trust, recipient, signer1 } =
        await basicSetup();

      const startBlock = await ethers.provider.getBlockNumber();

      const buyTokensViaEscrow = async (signer, spend, fee) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend.add(fee));

        const reserveSigner = reserve.connect(signer);

        await reserveSigner.approve(escrow.address, spend.add(fee));

        // onlyFactoryTrust modifier catches if trust address is not child of factory
        await Util.assertError(
          async () =>
            await escrow
              .connect(signer)
              .buyToken(
                signers[19].address,
                spend,
                ethers.BigNumber.from("1"),
                ethers.BigNumber.from("1000000" + Util.eighteenZeros),
                recipient.address,
                fee
              ),
          "revert FACTORY_TRUST",
          "buyToken proceeded despite trust address not being child of factory"
        );

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

      // signer1 uses a front end to buy token. Front end makes call to escrow contract so it takes a fee on behalf of recipient.
      await buyTokensViaEscrow(signer1, spend, fee);

      const reserveBalanceEscrow1 = await reserve.balanceOf(escrow.address);

      assert(
        reserveBalanceEscrow1.eq(fee),
        `wrong escrow reserve balance
      expected  ${fee}
      got       ${reserveBalanceEscrow1}`
      );

      // no-op claim if raise is still ongoing
      await escrow
        .connect(recipient)
        .claimFees(trust.address, recipient.address);

      const reserveBalanceRecipient1 = await reserve.balanceOf(
        recipient.address
      );

      assert(
        reserveBalanceRecipient1.isZero(),
        `wrong recipient reserve balance
      expected  0 (no fee claimed)
      got       ${reserveBalanceRecipient1}`
      );

      // onlyFactoryTrust modifier catches if trust address is not child of factory
      await Util.assertError(
        async () =>
          await escrow
            .connect(recipient)
            .claimFees(signers[19].address, recipient.address),
        "revert FACTORY_TRUST",
        "claimFees proceeded despite trust address not being child of factory"
      );
    });
  });
});
