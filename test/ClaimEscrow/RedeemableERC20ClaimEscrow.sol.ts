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

/* TESTS
Withdrawal behaviour:
- Multiple RedeemableERC20 holders
- Successive deposits and withdrawals for single sender
*/

describe("RedeemableERC20ClaimEscrow", async function () {
  it("should allow withdrawing redeemable tokens on successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim, trustFactory, tier } = await deployGlobals();

    const {
      redeemableERC20,
      trust,
      signer1,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, tier);

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

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

    // signer1 obtains tokens somehow
    await claimableToken.transfer(signer1.address, depositAmount);

    await claimableToken.connect(signer1).approve(claim.address, depositAmount);

    await claim
      .connect(signer1)
      .deposit(trust.address, claimableToken.address, depositAmount);

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

    // not testing withdraw behaviour here
  });

  it("should allow undepositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim, trustFactory, tier } = await deployGlobals();

    const {
      redeemableERC20,
      trust,
      signer1,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
    } = await basicSetup(signers, trustFactory, tier);

    // some other token to put into the escrow
    const claimableToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

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

    await claimableToken
      .connect(signer1)
      .approve(claim.address, depositAmount0);

    await claim
      .connect(signer1)
      .deposit(trust.address, claimableToken.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      claimableToken.address,
      signer1.address
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .undeposit(trust.address, claimableToken.address),
      "revert ONLY_FAIL",
      "wrongly undeposited during Trading"
    );

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .undeposit(trust.address, claimableToken.address),
      "revert ONLY_FAIL",
      "wrongly undeposited during TradingCanEnd"
    );

    await trust.anonEndDistribution();

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    // undeposit RedeemableERC20 tokens
    await claim
      .connect(signer1)
      .undeposit(trust.address, claimableToken.address);

    // read registered value
    const deposited1 = await claim.deposits(
      trust.address,
      claimableToken.address,
      signer1.address
    );

    const signer1TokensAfterUndeposit = await claimableToken.balanceOf(
      signer1.address
    );

    assert(
      signer1TokensAfterUndeposit.eq(depositAmount0),
      "token balance on signer1 was wrong"
    );

    assert(deposited1.isZero(), "should register that all tokens undeposited");
  });

  it("should prevent depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim, trustFactory, tier } = await deployGlobals();

    const {
      redeemableERC20,
      trust,
      signer1,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
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

    // deposit some RedeemableERC20 tokens
    const depositAmount0 = (
      await redeemableERC20.balanceOf(signer1.address)
    ).div(2);

    await redeemableERC20
      .connect(signer1)
      .approve(claim.address, depositAmount0);

    await claim
      .connect(signer1)
      .deposit(trust.address, redeemableERC20.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      redeemableERC20.address,
      signer1.address
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

    // deposit remaining RedeemableERC20 tokens
    const depositAmount1 = await redeemableERC20.balanceOf(signer1.address);

    await redeemableERC20
      .connect(signer1)
      .approve(claim.address, depositAmount1);

    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .deposit(trust.address, redeemableERC20.address, depositAmount1),
      "revert FAIL_DEPOSIT",
      "wrongly deposited when distribution status was Fail"
    );
  });

  it("should allow depositing redeemable tokens when not failed raise (during trading or successfully closed)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim, trustFactory, tier } = await deployGlobals();

    const {
      redeemableERC20,
      trust,
      signer1,
      reserve,
      crp,
      bPool,
      successLevel,
      minimumTradingDuration,
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

    // deposit some RedeemableERC20 tokens
    const depositAmount0 = (
      await redeemableERC20.balanceOf(signer1.address)
    ).div(2);

    await redeemableERC20
      .connect(signer1)
      .approve(claim.address, depositAmount0);

    await claim
      .connect(signer1)
      .deposit(trust.address, redeemableERC20.address, depositAmount0);

    // read registered value
    const deposited0 = await claim.deposits(
      trust.address,
      redeemableERC20.address,
      signer1.address
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

    // deposit some RedeemableERC20 tokens
    const depositAmount1 = (
      await redeemableERC20.balanceOf(signer1.address)
    ).div(2);

    await redeemableERC20
      .connect(signer1)
      .approve(claim.address, depositAmount1);

    await claim
      .connect(signer1)
      .deposit(trust.address, redeemableERC20.address, depositAmount1);

    // read registered value
    const deposited1 = await claim.deposits(
      trust.address,
      redeemableERC20.address,
      signer1.address
    );

    assert(
      !deposited1.eq(depositAmount1),
      "new deposit amount overrode registered value"
    );

    assert(
      deposited1.eq(depositAmount1.add(depositAmount0)),
      "actual tokens deposited and registered amount do not match (1)"
    );

    await trust.anonEndDistribution();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    // deposit remaining RedeemableERC20 tokens
    const depositAmount2 = await redeemableERC20.balanceOf(signer1.address);

    await redeemableERC20
      .connect(signer1)
      .approve(claim.address, depositAmount2);

    await claim
      .connect(signer1)
      .deposit(trust.address, redeemableERC20.address, depositAmount2);

    // read registered value
    const deposited2 = await claim.deposits(
      trust.address,
      redeemableERC20.address,
      signer1.address
    );

    assert(
      deposited2.eq(depositAmount2.add(depositAmount1.add(depositAmount0))),
      "actual tokens deposited and registered amount do not match (2)"
    );

    // one check for total deposits
    const totalDeposits = await claim.totalDeposits(
      trust.address,
      redeemableERC20.address
    );

    assert(
      totalDeposits.eq(depositAmount2.add(depositAmount1.add(depositAmount0))),
      "actual tokens depositing and registered total amount do not match"
    );
  });

  it("should check that trust address is child of trust factory", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { claim, trustFactory, tier } = await deployGlobals();

    const { redeemableERC20 } = await basicSetup(signers, trustFactory, tier);

    // bad trust address
    await Util.assertError(
      async () =>
        await claim.deposit(signers[19].address, redeemableERC20.address, 0),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
    await Util.assertError(
      async () =>
        await claim.undeposit(signers[19].address, redeemableERC20.address),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
    await Util.assertError(
      async () =>
        await claim.withdraw(signers[19].address, redeemableERC20.address),
      "revert FACTORY_CONTRACT",
      "did not check trust is child of trust factory"
    );
  });
});
