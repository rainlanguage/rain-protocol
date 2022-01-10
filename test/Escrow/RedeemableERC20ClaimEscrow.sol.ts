import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { basicSetup, deployGlobals } from "./EscrowUtil";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { RedeemableERC20ClaimEscrow } from "../../typechain/RedeemableERC20ClaimEscrow";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TrustFactory } from "../../typechain/TrustFactory";
import type { Contract } from "ethers";
import type { SeedERC20Factory } from "../../typechain/SeedERC20Factory";
import { getEventArgs } from "../Util";

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

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

let claim: RedeemableERC20ClaimEscrow & Contract,
  trustFactory: TrustFactory,
  seedERC20Factory: SeedERC20Factory,
  tier: ReadWriteTier,
  claimableReserveToken: ReserveToken & Contract;

describe("RedeemableERC20ClaimEscrow", async function () {
  before(async () => {
    ({ claim, trustFactory, seedERC20Factory, tier } = await deployGlobals());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    claimableReserveToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;
  });

  it("should distribute correct withdrawal proportion if RedeemableERC20 tokens are burned", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];
    const signer2 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("50" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("50" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount);
    // creator deposits claimable tokens
    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const sweep0 = await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );

    const supply0 = (await getEventArgs(sweep0, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const claimableTokensInEscrowDeposit0 = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    // signer1 should withdraw roughly 50% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await claimableReserveToken.balanceOf(
      signer1.address
    );

    assert(
      expectedSigner1Withdrawal0.eq(actualSigner1Withdrawal0),
      `wrong amount of claimable tokens withdrawn (first withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit0}
      expected        ${expectedSigner1Withdrawal0}
      got             ${actualSigner1Withdrawal0}`
    );

    // signer2 burns their RedeemableERC20 token balance for some reserve
    reserve.transfer(redeemableERC20.address, "1" + Util.sixZeros);
    await redeemableERC20
      .connect(signer2)
      .redeem(
        [reserve.address],
        await redeemableERC20.balanceOf(signer2.address)
      );

    // more claimable tokens are deposited by creator
    await claimableReserveToken.approve(claim.address, depositAmount);
    const deposit1 = await claim.deposit(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );

    const supply1 = (await getEventArgs(deposit1, "Deposit", claim)).supply;

    const claimableTokensInEscrowDeposit1 = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    // recalculate real RedeemableERC20 proportions
    const signer1PropAfterBurn = (
      await redeemableERC20.balanceOf(signer1.address)
    )
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 2nd withdraw
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1PropAfterBurn)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await claimableReserveToken.balanceOf(signer1.address)
    ).sub(actualSigner1Withdrawal0);

    assert(
      expectedSigner1Withdrawal1.eq(actualSigner1Withdrawal1),
      `wrong amount of claimable tokens withdrawn (second withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit1}
      expected        ${expectedSigner1Withdrawal1}
      got             ${actualSigner1Withdrawal1}`
    );
  });

  it("should support multiple withdrawals per sender if more claimable tokens are deposited after a withdrawal", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];
    const signer2 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("25" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("75" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount);
    // creator deposits claimable tokens
    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const deposit0 = await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );
    const supply0 = (await getEventArgs(deposit0, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const claimableTokensInEscrowDeposit0 = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await claimableReserveToken.balanceOf(
      signer1.address
    );

    assert(
      expectedSigner1Withdrawal0.eq(actualSigner1Withdrawal0),
      `wrong amount of claimable tokens withdrawn (first withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit0}
      expected        ${expectedSigner1Withdrawal0}
      got             ${actualSigner1Withdrawal0}`
    );

    // signer1 2nd withdraw
    // instantly withdrawing again is an error.
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, claimableReserveToken.address, supply0),
      "ZERO_WITHDRAW",
      "Failed to error on zero withdraw"
    );

    // more claimable tokens are deposited by creator
    await claimableReserveToken.approve(claim.address, depositAmount);
    const deposit1 = await claim.deposit(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );
    const supply1 = (await getEventArgs(deposit1, "Deposit", claim)).supply;

    const claimableTokensInEscrowDeposit1 = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    // signer1 3rd withdraw
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await claimableReserveToken.balanceOf(signer1.address)
    ).sub(actualSigner1Withdrawal0);

    assert(
      expectedSigner1Withdrawal1.eq(actualSigner1Withdrawal1),
      `wrong amount of claimable tokens withdrawn (third withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit1}
      expected        ${expectedSigner1Withdrawal1}
      got             ${actualSigner1Withdrawal1}`
    );
  });

  it("should allocate token withdrawals pro rata (sender's proportion of RedeemableERC20 total supply)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];
    const signer2 = signers[4];

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("25" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("75" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount);

    // creator deposits claimable tokens
    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const deposit = await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );
    const supply = (await getEventArgs(deposit, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const claimableTokensInEscrow = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    const expectedWithdrawal = depositAmount.mul(signer1Prop).div(Util.ONE);

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply);

    const actualWithdrawal = await claimableReserveToken.balanceOf(
      signer1.address
    );

    assert(
      expectedWithdrawal.eq(actualWithdrawal),
      `wrong amount of claimable tokens withdrawn
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrow}
      expected        ${expectedWithdrawal}
      got             ${actualWithdrawal}`
    );

    // signer2 should withdraw remaining claimable tokens in escrow
    await claim
      .connect(signer2)
      .withdraw(trust.address, claimableReserveToken.address, supply);

    const finalEscrowClaimableTokenBalance =
      await claimableReserveToken.balanceOf(claim.address);

    assert(
      finalEscrowClaimableTokenBalance.eq(0) ||
        finalEscrowClaimableTokenBalance.eq(1), // rounding error might leave 1 token
      `wrong final claimable tokens in escrow, got ${finalEscrowClaimableTokenBalance}`
    );
  });

  it("should allow withdrawing redeemable tokens on successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("50" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount);

    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount
    );

    const preSupply = await claimableReserveToken.totalSupply();

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, claimableReserveToken.address, preSupply),
      "NOT_SUCCESS",
      "wrongly withrew during Trading"
    );

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, claimableReserveToken.address, preSupply),
      "NOT_SUCCESS",
      "wrongly withdrew during TradingCanEnd"
    );

    await trust.endDutchAuction();

    const deposit = await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );
    const supply = (await getEventArgs(deposit, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableReserveToken.address, supply);

    const registeredWithdrawnAmountSigner1 = await claim.withdrawals(
      trust.address,
      claimableReserveToken.address,
      signer1.address,
      await redeemableERC20.totalSupply()
    );

    // total amount withdrawn and registered value should match
    assert(
      registeredWithdrawnAmountSigner1.eq(depositAmount),
      "wrong registered withdrawal value for signer1"
    );

    // not testing further withdrawal behaviour here
  });

  it("should allow undepositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("50" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount0);

    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount0
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    const preSupply = await claimableReserveToken.totalSupply();

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim.undeposit(
          trust.address,
          claimableReserveToken.address,
          preSupply,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "NOT_FAIL",
      "wrongly undeposited during Trading"
    );

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim.undeposit(
          trust.address,
          claimableReserveToken.address,
          preSupply,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "NOT_FAIL",
      "wrongly undeposited during TradingCanEnd"
    );

    await trust.endDutchAuction();

    const deposit0 = await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );
    const supply0 = (await getEventArgs(deposit0, "Deposit", claim)).supply;

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableReserveToken.address,
      creator.address,
      await redeemableERC20.totalSupply()
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    // undeposit claimable tokens
    await claim.undeposit(
      trust.address,
      claimableReserveToken.address,
      supply0,
      depositAmount0
    );

    // // read registered value
    // const deposited1 = await claim.deposits(
    //   trust.address,
    //   claimableReserveToken.address,
    //   creator.address,
    //   await redeemableERC20.totalSupply()
    // );

    // assert(
    //   deposited1.isZero(),
    //   `should register that all tokens undeposited
    //   expected  0
    //   got       ${deposited1}`
    // );

    // const creatorTokensAfterUndeposit = await claimableReserveToken.balanceOf(
    //   creator.address
    // );

    // assert(
    //   creatorTokensAfterUndeposit
    //     .sub(creatorTokensBeforeUndeposit)
    //     .eq(depositAmount0),
    //   `claimable token balance on creator was wrong
    //   expected  ${depositAmount0}
    //   got       ${creatorTokensAfterUndeposit.sub(
    //     creatorTokensBeforeUndeposit
    //   )}`
    // );
  });

  it("should allow depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("50" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount0);

    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount0
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );

    const supply = await redeemableERC20.totalSupply();

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableReserveToken.address,
      creator.address,
      supply
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount1);

    // can deposit and undeposit when fail
    await claim.deposit(
      trust.address,
      claimableReserveToken.address,
      depositAmount1
    );

    await claim.undeposit(
      trust.address,
      claimableReserveToken.address,
      supply,
      depositAmount1
    );
  });

  it("should allow depositing redeemable tokens when not failed raise (during trading or successfully closed)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      successLevel,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
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
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("50" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit some claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount0);

    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount0
    );

    // read registered value
    const deposited0 = await claim.pendingDeposits(
      trust.address,
      claimableReserveToken.address,
      creator.address
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match (0)"
    );

    // succeed raise
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // Distribution Status is TradingCanEnd
    assert(
      (await trust.getDistributionStatus()) ===
        DistributionStatus.TRADINGCANEND,
      "Distribution Status was not TRADINGCANEND"
    );

    // deposit some claimable tokens
    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    // creator deposits some tokens for claiming
    await claimableReserveToken.approve(claim.address, depositAmount1);

    await claim.depositPending(
      trust.address,
      claimableReserveToken.address,
      depositAmount1
    );

    // read registered value
    const deposited1 = await claim.pendingDeposits(
      trust.address,
      claimableReserveToken.address,
      creator.address
    );

    assert(
      deposited1.eq(depositAmount1.add(depositAmount0)),
      `actual tokens deposited by sender and registered amount do not match (1)
      expected  ${depositAmount1.add(
        depositAmount0
      )} = ${depositAmount1} + ${depositAmount0}
      got       ${deposited1}`
    );

    await trust.endDutchAuction();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // deposit some claimable tokens
    const depositAmount2 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableReserveToken.decimals())
    );

    await claimableReserveToken.approve(claim.address, depositAmount2);

    await claim.sweepPending(
      trust.address,
      claimableReserveToken.address,
      signers[0].address
    );

    await claim.deposit(
      trust.address,
      claimableReserveToken.address,
      depositAmount2
    );

    // read registered value
    const deposited2 = await claim.deposits(
      trust.address,
      claimableReserveToken.address,
      creator.address,
      await redeemableERC20.totalSupply()
    );

    assert(
      deposited2.eq(depositAmount2.add(depositAmount1.add(depositAmount0))),
      `actual tokens deposited by sender and registered amount do not match (2)
      expected  ${depositAmount2.add(
        depositAmount1.add(depositAmount0)
      )} = ${depositAmount2} + ${depositAmount1} + ${depositAmount0}
      got       ${deposited2}`
    );

    const totalDeposits = await claim.totalDeposits(
      trust.address,
      claimableReserveToken.address,
      await redeemableERC20.totalSupply()
    );

    assert(
      totalDeposits.eq(depositAmount2.add(depositAmount1.add(depositAmount0))),
      "actual total tokens deposited and registered total amount do not match (3)"
    );
  });

  it("should check that trust address is child of trust factory when depositing", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    await Util.assertError(
      async () =>
        await claim.deposit(
          signers[19].address, // bad trust address
          claimableReserveToken.address,
          0
        ),
      "NOT_TRUSTED_CHILD",
      "did not check trust is child of trust factory"
    );
  });
});
