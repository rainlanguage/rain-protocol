import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import {
  basicSetup,
  deployGlobals,
  failedRaise,
  successfulRaise,
} from "./BPoolFeeEscrowUtil";
import { getAddress } from "ethers/lib/utils";
import {
  ClaimFeesEvent,
  RefundFeesEvent,
} from "../../typechain/BPoolFeeEscrow";

const { assert } = chai;

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

describe("BPoolFeeEscrow", async function () {
  describe("should continue to work correctly for claimFees and refundFees in the case of emergency mode for Trust for an auction that", async function () {
    it("has ended successfully", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const { trustFactory, tier } = await deployGlobals();

      const {
        reserve,
        trust,
        recipient,
        signer1,
        bPoolFeeEscrow,
        fee,
        buyCount,
      } = await successfulRaise(signers, trustFactory, tier);

      assert(
        (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
        "raise wasn't successful"
      );

      // Suppose nothing is working, so we wait for current phase to last at least creatorFundsReleaseTimeout blocks
      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);
      // Move to emergency phase
      await trust.enableCreatorFundsRelease();

      // Attempting refund on successful raise should revert
      await Util.assertError(
        async () =>
          await bPoolFeeEscrow.connect(signer1).refundFees(trust.address),
        "NOT_FAIL",
        "wrongly refunded fees after successful raise"
      );

      const claimFeesTx = await bPoolFeeEscrow
        .connect(recipient)
        .claimFees(recipient.address, trust.address);

      // ClaimFees event
      const event = (await Util.getEventArgs(
        claimFeesTx,
        "ClaimFees",
        bPoolFeeEscrow
      )) as ClaimFeesEvent["args"];

      assert(event.sender === recipient.address, "wrong sender");
      assert(event.recipient === recipient.address, "wrong recipient");
      assert(event.trust === getAddress(trust.address), "wrong trust");
      assert(event.reserve === getAddress(reserve.address), "wrong reserve");
      assert(event.claimedFees.eq(90000000), "wrong claimed fees");

      const reserveBalanceRecipient2 = await reserve.balanceOf(
        recipient.address
      );

      // recipient should have claimed fees after calling `claimFees` after successful raise
      assert(
        reserveBalanceRecipient2.eq(fee.mul(buyCount)),
        `wrong recipient claim amount
          expected      ${fee.mul(buyCount)}
          got           ${reserveBalanceRecipient2}
          reserveEscrow ${await reserve.balanceOf(bPoolFeeEscrow.address)}`
      );
    });

    it("has ended unsuccessfully", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const { trustFactory, tier } = await deployGlobals();

      const {
        reserve,
        trust,
        recipient,
        signer1,
        minimumTradingDuration,
        redeemableERC20,
        bPoolFeeEscrow,
        bPool,
      } = await basicSetup(signers, trustFactory, tier);

      const startBlock = await ethers.provider.getBlockNumber();

      const buyTokensViaEscrow = async (signer, spend, fee) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend.add(fee));

        await reserve
          .connect(signer)
          .approve(bPoolFeeEscrow.address, spend.add(fee));

        await bPoolFeeEscrow
          .connect(signer)
          .buyToken(
            recipient.address,
            trust.address,
            fee,
            spend,
            ethers.BigNumber.from("1"),
            ethers.BigNumber.from("1000000" + Util.eighteenZeros)
          );
      };

      const spend = ethers.BigNumber.from("250" + Util.sixZeros);
      const fee = ethers.BigNumber.from("10" + Util.sixZeros);

      // raise unsufficient funds
      await buyTokensViaEscrow(signer1, spend, fee);

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

      // actually end raise
      await trust.endDutchAuctionAndTransfer();

      assert(
        (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
        "raise wasn't failure"
      );

      // Suppose nothing is working, so we wait for current phase to last at least creatorFundsReleaseTimeout blocks
      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);
      // Move to emergency phase
      await trust.enableCreatorFundsRelease();

      // attempting claim fees on failed raise should revert.
      await Util.assertError(
        async () =>
          bPoolFeeEscrow
            .connect(recipient)
            .claimFees(recipient.address, trust.address),
        "NOT_SUCCESS",
        "wrongly claimed fees after failed raise"
      );

      const reserveRedeemableERC20_1 = await reserve.balanceOf(
        redeemableERC20.address
      );

      // anyone can trigger refund.
      const refundFeesTx = await bPoolFeeEscrow
        .connect(signer1)
        .refundFees(trust.address);

      // RefundFees event
      const event = (await Util.getEventArgs(
        refundFeesTx,
        "RefundFees",
        bPoolFeeEscrow
      )) as RefundFeesEvent["args"];

      assert(event.sender === signer1.address, "wrong sender");
      assert(event.trust === getAddress(trust.address), "wrong trust");
      assert(event.reserve === getAddress(reserve.address), "wrong reserve");
      assert(
        event.redeemable === getAddress(redeemableERC20.address),
        "wrong redeemable"
      );
      assert(event.refundedFees.eq(10000000), "wrong refundedFees");

      const reserveRedeemableERC20_2 = await reserve.balanceOf(
        redeemableERC20.address
      );

      const reserveOnTokenDifference = reserveRedeemableERC20_2.sub(
        reserveRedeemableERC20_1
      );

      assert(
        reserveOnTokenDifference.eq(fee),
        `wrong fee amount refunded
          expected  ${fee}
          got       ${reserveOnTokenDifference}`
      );

      const signer1Reserve_1 = await reserve.balanceOf(signer1.address);

      assert(
        signer1Reserve_1.isZero(),
        "signer1 should have spent all their reserve when buying tokens"
      );

      // signer1 can redeem token for this refunded reserve
      await redeemableERC20
        .connect(signer1)
        .redeem(
          [reserve.address],
          await redeemableERC20.balanceOf(signer1.address)
        );

      const signer1Reserve_2 = await reserve.balanceOf(signer1.address);

      const poolDust = await reserve.balanceOf(bPool.address);

      assert(
        signer1Reserve_2.eq(spend.add(fee).sub(poolDust)),
        `signer1 should get full refund (spend AND fee from escrow contract)
          expected  ${spend.add(fee).sub(poolDust)}
          got       ${signer1Reserve_2}`
      );
    });

    it("could not end and skipped to emergency mode (success case)", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const { trustFactory, tier } = await deployGlobals();

      const {
        reserve,
        trust,
        recipient,
        signer1,
        bPoolFeeEscrow,
        fee,
        redeemableERC20,
        bPool,
        spend,
        buyCount,
      } = await successfulRaise(signers, trustFactory, tier, false); // don't end raise

      assert(
        (await trust.getDistributionStatus()) ===
          DistributionStatus.TRADINGCANEND,
        "raise wasn't TRADINGCANEND"
      );

      // Suppose nothing is working, so we wait for current phase to last at least creatorFundsReleaseTimeout blocks
      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);
      // Move to emergency phase
      await trust.enableCreatorFundsRelease();

      // While the raise should've been 'successful', since we did not properly close the raise it is effectively an invalid raise. Hence, we default to a 'failed' state.

      // attempting claim fees on failed raise should revert.
      await Util.assertError(
        async () =>
          bPoolFeeEscrow
            .connect(recipient)
            .claimFees(recipient.address, trust.address),
        "NOT_SUCCESS",
        "wrongly claimed fees after failed raise"
      );

      const reserveRedeemableERC20_1 = await reserve.balanceOf(
        redeemableERC20.address
      );

      // anyone can trigger refund.
      const refundFeesTx = await bPoolFeeEscrow
        .connect(signer1)
        .refundFees(trust.address);

      // RefundFees event
      const event = (await Util.getEventArgs(
        refundFeesTx,
        "RefundFees",
        bPoolFeeEscrow
      )) as RefundFeesEvent["args"];

      assert(event.sender === signer1.address, "wrong sender");
      assert(event.trust === getAddress(trust.address), "wrong trust");
      assert(event.reserve === getAddress(reserve.address), "wrong reserve");
      assert(
        event.redeemable === getAddress(redeemableERC20.address),
        "wrong redeemable"
      );
      assert(
        event.refundedFees.eq(90000000),
        `wrong refundedFees, got ${event.refundedFees}`
      );

      const reserveRedeemableERC20_2 = await reserve.balanceOf(
        redeemableERC20.address
      );

      const reserveOnTokenDifference = reserveRedeemableERC20_2.sub(
        reserveRedeemableERC20_1
      );

      assert(
        reserveOnTokenDifference.eq(fee.mul(buyCount)),
        `wrong fee amount refunded
          expected  ${fee.mul(buyCount)}
          got       ${reserveOnTokenDifference}`
      );

      const signer1Reserve_1 = await reserve.balanceOf(signer1.address);

      assert(
        signer1Reserve_1.isZero(),
        "signer1 should have spent all their reserve when buying tokens"
      );

      const redeemableERC20ReserveBalance = await reserve.balanceOf(
        redeemableERC20.address
      );
      console.log({ redeemableERC20ReserveBalance });

      // signer1 can redeem token for this refunded reserve
      await redeemableERC20
        .connect(signer1)
        .redeem(
          [reserve.address],
          await redeemableERC20.balanceOf(signer1.address)
        );

      const signer1Reserve_2 = await reserve.balanceOf(signer1.address);

      const poolDust = await reserve.balanceOf(bPool.address);

      assert(
        signer1Reserve_2.eq(spend.add(fee.mul(buyCount)).sub(poolDust)),
        `signer1 should get full refund (spend AND fee from escrow contract)
          expected  ${spend.add(fee.mul(buyCount)).sub(poolDust)}
          got       ${signer1Reserve_2}`
      );
    });

    it("could not end and skipped to emergency mode (fail case)", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const { trustFactory, tier } = await deployGlobals();

      const {
        reserve,
        trust,
        recipient,
        signer1,
        minimumTradingDuration,
        redeemableERC20,
        bPoolFeeEscrow,
        bPool,
      } = await basicSetup(signers, trustFactory, tier);

      const startBlock = await ethers.provider.getBlockNumber();

      const buyTokensViaEscrow = async (signer, spend, fee) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend.add(fee));

        await reserve
          .connect(signer)
          .approve(bPoolFeeEscrow.address, spend.add(fee));

        await bPoolFeeEscrow
          .connect(signer)
          .buyToken(
            recipient.address,
            trust.address,
            fee,
            spend,
            ethers.BigNumber.from("1"),
            ethers.BigNumber.from("1000000" + Util.eighteenZeros)
          );
      };

      const spend = ethers.BigNumber.from("250" + Util.sixZeros);
      const fee = ethers.BigNumber.from("10" + Util.sixZeros);

      // raise unsufficient funds
      await buyTokensViaEscrow(signer1, spend, fee);

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

      // don't end raise

      assert(
        (await trust.getDistributionStatus()) ===
          DistributionStatus.TRADINGCANEND,
        "raise wasn't still TRADINGCANEND"
      );

      // Suppose nothing is working, so we wait for current phase to last at least creatorFundsReleaseTimeout blocks
      await Util.createEmptyBlock(Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING);
      // Move to emergency phase
      await trust.enableCreatorFundsRelease();

      // attempting claim fees on failed raise should revert.
      await Util.assertError(
        async () =>
          bPoolFeeEscrow
            .connect(recipient)
            .claimFees(recipient.address, trust.address),
        "NOT_SUCCESS",
        "wrongly claimed fees after failed raise"
      );

      const reserveRedeemableERC20_1 = await reserve.balanceOf(
        redeemableERC20.address
      );

      // anyone can trigger refund.
      const refundFeesTx = await bPoolFeeEscrow
        .connect(signer1)
        .refundFees(trust.address);

      // RefundFees event
      const event = (await Util.getEventArgs(
        refundFeesTx,
        "RefundFees",
        bPoolFeeEscrow
      )) as RefundFeesEvent["args"];

      assert(event.sender === signer1.address, "wrong sender");
      assert(event.trust === getAddress(trust.address), "wrong trust");
      assert(event.reserve === getAddress(reserve.address), "wrong reserve");
      assert(
        event.redeemable === getAddress(redeemableERC20.address),
        "wrong redeemable"
      );
      assert(event.refundedFees.eq(10000000), "wrong refundedFees");

      const reserveRedeemableERC20_2 = await reserve.balanceOf(
        redeemableERC20.address
      );

      const reserveOnTokenDifference = reserveRedeemableERC20_2.sub(
        reserveRedeemableERC20_1
      );

      assert(
        reserveOnTokenDifference.eq(fee),
        `wrong fee amount refunded
          expected  ${fee}
          got       ${reserveOnTokenDifference}`
      );

      const signer1Reserve_1 = await reserve.balanceOf(signer1.address);

      assert(
        signer1Reserve_1.isZero(),
        "signer1 should have spent all their reserve when buying tokens"
      );

      const redeemableERC20ReserveBalance = await reserve.balanceOf(
        redeemableERC20.address
      );
      console.log({ redeemableERC20ReserveBalance });

      // signer1 can redeem token for this refunded reserve
      await redeemableERC20
        .connect(signer1)
        .redeem(
          [reserve.address],
          await redeemableERC20.balanceOf(signer1.address)
        );

      const signer1Reserve_2 = await reserve.balanceOf(signer1.address);

      const poolDust = await reserve.balanceOf(bPool.address);

      assert(
        signer1Reserve_2.eq(spend.add(fee).sub(poolDust)),
        `signer1 should get full refund (spend AND fee from escrow contract)
          expected  ${spend.add(fee).sub(poolDust)}
          got       ${signer1Reserve_2}`
      );
    });
  });

  it("should prevent claiming and refunding until raise has ended", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();

    const { recipient, trust, bPoolFeeEscrow } = await basicSetup(
      signers,
      trustFactory,
      tier
    );

    await Util.assertError(
      async () =>
        await bPoolFeeEscrow
          .connect(recipient)
          .claimFees(recipient.address, trust.address),
      "NOT_SUCCESS",
      "wrongly attempted claim before raise ended"
    );

    await Util.assertError(
      async () =>
        await bPoolFeeEscrow.connect(recipient).refundFees(trust.address),
      "NOT_FAIL",
      "wrongly attempted refund before raise ended"
    );
  });

  it("should refund fees (via token contract) upon failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();

    const {
      reserve,
      trust,
      recipient,
      signer1,
      minimumTradingDuration,
      redeemableERC20,
      bPoolFeeEscrow,
      bPool,
    } = await basicSetup(signers, trustFactory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      await reserve
        .connect(signer)
        .approve(bPoolFeeEscrow.address, spend.add(fee));

      await bPoolFeeEscrow
        .connect(signer)
        .buyToken(
          recipient.address,
          trust.address,
          fee,
          spend,
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.eighteenZeros)
        );
    };

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);
    const fee = ethers.BigNumber.from("10" + Util.sixZeros);

    // raise unsufficient funds
    await buyTokensViaEscrow(signer1, spend, fee);

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

    // actually end raise
    await trust.endDutchAuctionAndTransfer();

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "raise wasn't failure"
    );

    // attempting claim fees on failed raise should revert.
    await Util.assertError(
      async () =>
        bPoolFeeEscrow
          .connect(recipient)
          .claimFees(recipient.address, trust.address),
      "NOT_SUCCESS",
      "wrongly claimed fees after failed raise"
    );

    const reserveRedeemableERC20_1 = await reserve.balanceOf(
      redeemableERC20.address
    );

    // anyone can trigger refund.
    const refundFeesTx = await bPoolFeeEscrow
      .connect(signer1)
      .refundFees(trust.address);

    // RefundFees event
    const event = (await Util.getEventArgs(
      refundFeesTx,
      "RefundFees",
      bPoolFeeEscrow
    )) as RefundFeesEvent["args"];

    assert(event.sender === signer1.address, "wrong sender");
    assert(event.trust === getAddress(trust.address), "wrong trust");
    assert(event.reserve === getAddress(reserve.address), "wrong reserve");
    assert(
      event.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(event.refundedFees.eq(10000000), "wrong refundedFees");

    const reserveRedeemableERC20_2 = await reserve.balanceOf(
      redeemableERC20.address
    );

    const reserveOnTokenDifference = reserveRedeemableERC20_2.sub(
      reserveRedeemableERC20_1
    );

    assert(
      reserveOnTokenDifference.eq(fee),
      `wrong fee amount refunded
      expected  ${fee}
      got       ${reserveOnTokenDifference}`
    );

    const signer1Reserve_1 = await reserve.balanceOf(signer1.address);

    assert(
      signer1Reserve_1.isZero(),
      "signer1 should have spent all their reserve when buying tokens"
    );

    // signer1 can redeem token for this refunded reserve
    await redeemableERC20
      .connect(signer1)
      .redeem(
        [reserve.address],
        await redeemableERC20.balanceOf(signer1.address)
      );

    const signer1Reserve_2 = await reserve.balanceOf(signer1.address);

    const poolDust = await reserve.balanceOf(bPool.address);

    assert(
      signer1Reserve_2.eq(spend.add(fee).sub(poolDust)),
      `signer1 should get full refund (spend AND fee from escrow contract)
      expected  ${spend.add(fee).sub(poolDust)}
      got       ${signer1Reserve_2}`
    );
  });

  it("should allow recipient to claim fees upon successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();

    const {
      reserve,
      trust,
      recipient,
      signer1,
      bPoolFeeEscrow,
      fee,
      buyCount,
    } = await successfulRaise(signers, trustFactory, tier);

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "raise wasn't successful"
    );

    // Attempting refund on successful raise should revert
    await Util.assertError(
      async () =>
        await bPoolFeeEscrow.connect(signer1).refundFees(trust.address),
      "NOT_FAIL",
      "wrongly refunded fees after successful raise"
    );

    const claimFeesTx = await bPoolFeeEscrow
      .connect(recipient)
      .claimFees(recipient.address, trust.address);

    // ClaimFees event
    const event = (await Util.getEventArgs(
      claimFeesTx,
      "ClaimFees",
      bPoolFeeEscrow
    )) as ClaimFeesEvent["args"];

    assert(event.sender === recipient.address, "wrong sender");
    assert(event.recipient === recipient.address, "wrong recipient");
    assert(event.trust === getAddress(trust.address), "wrong trust");
    assert(event.reserve === getAddress(reserve.address), "wrong reserve");
    assert(event.claimedFees.eq(90000000), "wrong claimed fees");

    const reserveBalanceRecipient2 = await reserve.balanceOf(recipient.address);

    // recipient should have claimed fees after calling `claimFees` after successful raise
    assert(
      reserveBalanceRecipient2.eq(fee.mul(buyCount)),
      `wrong recipient claim amount
      expected      ${fee.mul(buyCount)}
      got           ${reserveBalanceRecipient2}
      reserveEscrow ${await reserve.balanceOf(bPoolFeeEscrow.address)}`
    );
  });

  it("should allow front end user to buy tokens, and escrow takes a fee", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();

    // signer1 uses a front end to buy token. Front end makes call to bPoolFeeEscrow contract so it takes a fee on behalf of recipient.
    const { reserve, trust, recipient, bPoolFeeEscrow, fee } =
      await failedRaise(signers, trustFactory, tier);

    const reserveBalanceEscrow1 = await reserve.balanceOf(
      bPoolFeeEscrow.address
    );

    assert(
      reserveBalanceEscrow1.eq(fee),
      `wrong bPoolFeeEscrow reserve balance
      expected  ${fee}
      got       ${reserveBalanceEscrow1}`
    );

    // should revert a claim if raise failed
    await Util.assertError(
      async () =>
        await bPoolFeeEscrow
          .connect(recipient)
          .claimFees(recipient.address, trust.address),
      "NOT_SUCCESS",
      "wrongly claimed fees while raise was ongoing"
    );

    const reserveBalanceRecipient1 = await reserve.balanceOf(recipient.address);

    assert(
      reserveBalanceRecipient1.isZero(),
      `wrong recipient reserve balance
      expected  0 (no fee claimed)
      got       ${reserveBalanceRecipient1}`
    );

    // refund should work because raise failed.
    await bPoolFeeEscrow.connect(recipient).refundFees(trust.address);

    const reserveBalanceToken = await reserve.balanceOf(await trust.token());

    assert(
      reserveBalanceToken.eq(fee),
      `wrong token balance after refund
      expected ${fee}
      got      ${reserveBalanceToken}`
    );
  });
});
