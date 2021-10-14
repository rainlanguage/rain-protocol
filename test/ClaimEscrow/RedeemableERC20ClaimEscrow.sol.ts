import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { basicSetup, deployGlobals } from "./ClaimUtil";
import type { ReserveToken } from "../../typechain/ReserveToken";

chai.use(solidity);
const { expect, assert } = chai;

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

describe("RedeemableERC20ClaimEscrow", async function () {
  it("should support multiple withdrawals per sender if more claimable tokens are deposited after a withdraw", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];
    const signer2 = signers[4];

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount);
    // creator deposits claimable tokens
    await claim.deposit(trust.address, claimableToken.address, depositAmount);

    const claimableTokensInEscrowDeposit0 = await claim.totalDeposits(
      trust.address,
      claimableToken.address
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.anonEndDistribution();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // calculate real RedeemableERC20 proportions

    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const signer2Prop = (await redeemableERC20.balanceOf(signer2.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableToken.address);

    const expectedSigner1Withdrawal0 = claimableTokensInEscrowDeposit0
      .sub(0) // signer1 hasn't withdrawn anything yet
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await claimableToken.balanceOf(
      signer1.address
    );

    assert(
      expectedSigner1Withdrawal0.eq(actualSigner1Withdrawal0),
      `wrong amount of claimable tokens withdrawn (0)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit0}
      expected        ${expectedSigner1Withdrawal0}
      got             ${actualSigner1Withdrawal0}`
    );

    const signer1TokensBefore2ndWithdraw = await claimableToken.balanceOf(
      signer1.address
    );
    // signer1 2nd withdraw
    // instantly withdrawing again is effectively a no-op
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableToken.address);
    const signer1TokensAfter2ndWithdraw = await claimableToken.balanceOf(
      signer1.address
    );
    assert(
      signer1TokensBefore2ndWithdraw.eq(signer1TokensAfter2ndWithdraw),
      `signer1 wrongly withdrew more tokens on successive withdraw before more tokens were deposited
      before      ${signer1TokensBefore2ndWithdraw}
      after       ${signer1TokensAfter2ndWithdraw}
      `
    );

    // more claimable tokens are deposited by creator
    await claimableToken.approve(claim.address, depositAmount);
    await claim.deposit(trust.address, claimableToken.address, depositAmount);

    const claimableTokensInEscrowDeposit1 = await claim.totalDeposits(
      trust.address,
      claimableToken.address
    );

    // signer1 3rd withdraw
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableToken.address);

    const expectedSigner1Withdrawal1 = claimableTokensInEscrowDeposit1
      .sub(actualSigner1Withdrawal0)
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await claimableToken.balanceOf(signer1.address)
    ).sub(actualSigner1Withdrawal0);

    assert(
      expectedSigner1Withdrawal1.eq(actualSigner1Withdrawal1),
      `wrong amount of claimable tokens withdrawn (1)
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

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount);

    // creator deposits claimable tokens
    await claim.deposit(trust.address, claimableToken.address, depositAmount);

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.anonEndDistribution();

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
      claimableToken.address
    );

    const expectedWithdrawal = claimableTokensInEscrow
      .mul(signer1Prop)
      .div(Util.ONE);

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableToken.address);

    const actualWithdrawal = await claimableToken.balanceOf(signer1.address);

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
      .withdraw(trust.address, claimableToken.address);

    const finalEscrowClaimableTokenBalance = await claimableToken.balanceOf(
      claim.address
    );

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

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
      creator,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount);

    await claim.deposit(trust.address, claimableToken.address, depositAmount);

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, claimableToken.address),
      "revert ONLY_SUCCESS",
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
          .withdraw(trust.address, claimableToken.address),
      "revert ONLY_SUCCESS",
      "wrongly withdrew during TradingCanEnd"
    );

    await trust.anonEndDistribution();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    await claim
      .connect(signer1)
      .withdraw(trust.address, claimableToken.address);

    const registeredWithdrawnAmountSigner1 = await claim.withdrawals(
      trust.address,
      claimableToken.address,
      signer1.address
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

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount0);

    await claim.deposit(trust.address, claimableToken.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableToken.address,
      creator.address
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    // prevent undeposit until status Fail
    await Util.assertError(
      async () => await claim.undeposit(trust.address, claimableToken.address),
      "revert ONLY_FAIL",
      "wrongly undeposited during Trading"
    );

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent undeposit until status Fail
    await Util.assertError(
      async () => await claim.undeposit(trust.address, claimableToken.address),
      "revert ONLY_FAIL",
      "wrongly undeposited during TradingCanEnd"
    );

    await trust.anonEndDistribution();

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    const creatorTokensBeforeUndeposit = await claimableToken.balanceOf(
      creator.address
    );

    // undeposit claimable tokens
    await claim.undeposit(trust.address, claimableToken.address);

    // read registered value
    const deposited1 = await claim.deposits(
      trust.address,
      claimableToken.address,
      creator.address
    );

    assert(
      deposited1.isZero(),
      `should register that all tokens undeposited
      expected  0
      got       ${deposited1}`
    );

    const creatorTokensAfterUndeposit = await claimableToken.balanceOf(
      creator.address
    );

    assert(
      creatorTokensAfterUndeposit
        .sub(creatorTokensBeforeUndeposit)
        .eq(depositAmount0),
      `claimable token balance on creator was wrong
      expected  ${depositAmount0}
      got       ${creatorTokensAfterUndeposit.sub(
        creatorTokensBeforeUndeposit
      )}`
    );
  });

  it("should prevent depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount0);

    await claim.deposit(trust.address, claimableToken.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableToken.address,
      creator.address
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.anonEndDistribution();

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount1);

    await Util.assertError(
      async () =>
        await claim.deposit(
          trust.address,
          claimableToken.address,
          depositAmount1
        ),
      "revert FAIL_DEPOSIT",
      "wrongly deposited when distribution status was Fail"
    );
  });

  it("should allow depositing redeemable tokens when not failed raise (during trading or successfully closed)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    const { claim, trustFactory, tier } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      successLevel,
      minimumTradingDuration,
      creator,
    } = await basicSetup(signers, trustFactory, tier);

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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount0);

    await claim.deposit(trust.address, claimableToken.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableToken.address,
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
      "100" + "0".repeat(await claimableToken.decimals())
    );

    // creator deposits some tokens for claiming
    await claimableToken.approve(claim.address, depositAmount1);

    await claim.deposit(trust.address, claimableToken.address, depositAmount1);

    // read registered value
    const deposited1 = await claim.deposits(
      trust.address,
      claimableToken.address,
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

    await trust.anonEndDistribution();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // deposit some claimable tokens
    const depositAmount2 = ethers.BigNumber.from(
      "100" + "0".repeat(await claimableToken.decimals())
    );

    await claimableToken.approve(claim.address, depositAmount2);

    await claim.deposit(trust.address, claimableToken.address, depositAmount2);

    // read registered value
    const deposited2 = await claim.deposits(
      trust.address,
      claimableToken.address,
      creator.address
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
      claimableToken.address
    );

    assert(
      totalDeposits.eq(depositAmount2.add(depositAmount1.add(depositAmount0))),
      "actual total tokens deposited and registered total amount do not match (3)"
    );
  });

  it("should check that trust address is child of trust factory", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim } = await deployGlobals();

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    await Util.assertError(
      async () =>
        await claim.deposit(
          signers[19].address, // bad trust address
          claimableToken.address,
          0
        ),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
    await Util.assertError(
      async () =>
        await claim.undeposit(signers[19].address, claimableToken.address),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
    await Util.assertError(
      async () =>
        await claim.withdraw(signers[19].address, claimableToken.address),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
  });
});
