import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  basicSetup,
  deployGlobals,
  failedRaise,
  successfulRaise,
} from "./BPoolFeeEscrowUtil";
import { getAddress } from "ethers/lib/utils";

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

describe("BPoolFeeEscrow", async function () {
  it("should not change contract state if unknown trust is claimed against", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();
    const { trustFactory: trustFactory2 } = await deployGlobals();

    const { reserve, recipient, trust } = await basicSetup(
      signers,
      trustFactory,
      tier
    );
    const { trust: unknownTrust } = await basicSetup(
      signers,
      trustFactory2,
      tier
    );

    const minFees0 = await escrow.minFees(recipient.address, reserve.address);
    const fees0 = await escrow.fees(trust.address, recipient.address);
    const feesUnknown0 = await escrow.fees(
      unknownTrust.address,
      recipient.address
    );
    const failureRefunds0 = await escrow.failureRefunds(trust.address);
    const failureRefundsUnknown0 = await escrow.failureRefunds(
      unknownTrust.address
    );
    const abandoned0 = await escrow.abandoned(trust.address);
    const abandonedUnknown0 = await escrow.abandoned(unknownTrust.address);

    let pendingTrustOutOfBounds0: string;
    await Util.assertError(
      async () => {
        pendingTrustOutOfBounds0 = await escrow.getPending(
          recipient.address,
          0
        );
      },
      "revert EnumerableSet: index out of bounds",
      `did not error, should be out of bounds, got value ${pendingTrustOutOfBounds0}`
    );

    await escrow.connect(recipient).anonClaimFees(
      recipient.address,
      unknownTrust.address // unknown trust created by different trust factory
    );

    const minFees1 = await escrow.minFees(recipient.address, reserve.address);
    const fees1 = await escrow.fees(trust.address, recipient.address);
    const feesUnknown1 = await escrow.fees(
      unknownTrust.address,
      recipient.address
    );
    const failureRefunds1 = await escrow.failureRefunds(trust.address);
    const failureRefundsUnknown1 = await escrow.failureRefunds(
      unknownTrust.address
    );
    const abandoned1 = await escrow.abandoned(trust.address);
    const abandonedUnknown1 = await escrow.abandoned(unknownTrust.address);

    let pendingTrustOutOfBounds1: string;
    await Util.assertError(
      async () => {
        pendingTrustOutOfBounds1 = await escrow.getPending(
          recipient.address,
          0
        );
      },
      "revert EnumerableSet: index out of bounds",
      `did not error, should be out of bounds, got value ${pendingTrustOutOfBounds1}`
    );

    const beforeState = [
      minFees0,
      fees0,
      feesUnknown0,
      failureRefunds0,
      failureRefundsUnknown0,
      abandoned0,
      abandonedUnknown0,
    ];
    const afterState = [
      minFees1,
      fees1,
      feesUnknown1,
      failureRefunds1,
      failureRefundsUnknown1,
      abandoned1,
      abandonedUnknown1,
    ];

    for (let i = 0; i < beforeState.length; i++) {
      const before = beforeState[i];
      const after = afterState[i];

      assert(before.eq(after), `${before} did not match ${after}, index ${i}`);
    }
  });

  it("should return pending claims via getter by index", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { recipient, trust } = await successfulRaise(
      signers,
      escrow,
      trustFactory,
      tier
    );

    const pendingTrust = await escrow.getPending(recipient.address, 0);

    assert(
      pendingTrust.toLowerCase() === trust.address.toLowerCase(),
      `did not return correct pending trust address for recipient
      expected  ${trust.address.toLowerCase()}
      got       ${pendingTrust.toLowerCase()}`
    );

    await escrow
      .connect(recipient)
      .anonClaimFees(recipient.address, trust.address);

    let pendingTrustOutOfBounds: string;
    await Util.assertError(
      async () => {
        pendingTrustOutOfBounds = await escrow.getPending(recipient.address, 0);
      },
      "revert EnumerableSet: index out of bounds",
      `did not error, should be out of bounds, got value ${pendingTrustOutOfBounds}`
    );
  });

  it("should allow recipient to enforce min fee amount per reserve", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { reserve, trust, recipient, signer1 } = await basicSetup(
      signers,
      trustFactory,
      tier
    );

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);
    const fee = ethers.BigNumber.from("10" + Util.sixZeros);

    const setMinFeesPromise = escrow
      .connect(recipient)
      .recipientSetMinFees(reserve.address, fee.mul(2));

    // MinFeesChange event (set)
    await expect(setMinFeesPromise)
      .to.emit(escrow, "MinFeesChange")
      .withArgs(recipient.address, getAddress(reserve.address), [
        0,
        fee.mul(2),
      ]);

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      await reserve.connect(signer).approve(escrow.address, spend.add(fee));

      await escrow
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

    await Util.assertError(
      async () => await buyTokensViaEscrow(signer1, spend, fee),
      "revert MIN_FEE",
      "wrongly bought token with insufficient fee amount"
    );

    const oldMinFees = await escrow.minFees(recipient.address, reserve.address);

    // unset min fee to block all token sales using this reserve
    const unsetMinFeesPromise = escrow
      .connect(recipient)
      .recipientUnsetMinFees(reserve.address);

    // MinFeesChange event (unset)
    await expect(unsetMinFeesPromise)
      .to.emit(escrow, "MinFeesChange")
      .withArgs(recipient.address, getAddress(reserve.address), [
        oldMinFees,
        0,
      ]);

    await Util.assertError(
      async () => await buyTokensViaEscrow(signer1, spend, fee),
      "revert UNSET_FEE",
      "wrongly bought token when min fee was unset"
    );

    // set min fee less than provided fee
    await escrow
      .connect(recipient)
      .recipientSetMinFees(reserve.address, fee.div(2));
    await buyTokensViaEscrow(signer1, spend, fee);

    // set min fee equal to provided fee
    await escrow.connect(recipient).recipientSetMinFees(reserve.address, fee);
    await buyTokensViaEscrow(signer1, spend, fee);
  });

  it("should still refund abandoned fees on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { recipient, trust, spend, fee, reserve, signer1, redeemableERC20 } =
      await failedRaise(signers, escrow, trustFactory, tier);

    // should have correct fee in escrow
    assert((await escrow.fees(trust.address, recipient.address)).eq(fee));
    assert((await escrow.abandoned(trust.address)).isZero());
    assert((await escrow.failureRefunds(trust.address)).eq(fee));

    // a recipient abandoning fees should not prevent them being refunded after a failed raise
    await escrow.connect(recipient).recipientAbandonTrust(trust.address);

    assert((await escrow.fees(trust.address, recipient.address)).isZero());
    assert((await escrow.abandoned(trust.address)).eq(fee));
    assert((await escrow.failureRefunds(trust.address)).isZero());

    const reserveOnTokenBefore = await reserve.balanceOf(
      redeemableERC20.address
    );

    // spend should be returned to token for redemption, but fee still in escrow
    assert(
      reserveOnTokenBefore.eq(spend),
      `wrong remainder transferred to reserve
      expected  ${spend}
      got       ${reserveOnTokenBefore}`
    );

    // refund fee including abandoned
    await escrow.connect(signer1).anonRefundFees(trust.address);

    const reserveOnTokenAfter = await reserve.balanceOf(
      redeemableERC20.address
    );

    const expectedRefund = fee;
    const actualRefund = reserveOnTokenAfter.sub(reserveOnTokenBefore);

    assert(
      expectedRefund.eq(actualRefund),
      `wrong amount refunded to token
      expected  ${expectedRefund}
      got       ${actualRefund}`
    );
  });

  it("should allow recipient to abandon claimable fees", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { recipient, trust, totalFee, reserve } = await successfulRaise(
      signers,
      escrow,
      trustFactory,
      tier
    );

    // recipient has claimable fees for this trust
    assert((await escrow.fees(trust.address, recipient.address)).eq(totalFee));
    assert((await escrow.abandoned(trust.address)).isZero());

    const oldFees = await escrow.fees(trust.address, recipient.address);

    const abandonTrustPromise = escrow
      .connect(recipient)
      .recipientAbandonTrust(trust.address);

    // AbandonTrust event
    await expect(abandonTrustPromise)
      .to.emit(escrow, "AbandonTrust")
      .withArgs(recipient.address, getAddress(trust.address), oldFees);

    // recipient no longer has claimable fees for this trust
    assert((await escrow.fees(trust.address, recipient.address)).isZero());
    assert((await escrow.abandoned(trust.address)).eq(totalFee));

    assert((await reserve.balanceOf(recipient.address)).isZero());

    await escrow
      .connect(recipient)
      .anonClaimFees(recipient.address, trust.address);

    assert((await reserve.balanceOf(recipient.address)).isZero());
  });

  it("should allow recipient to batch claim fees", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    // do first raise
    const {
      reserve: reserve1,
      recipient,
      fee,
      buyCount: buyCount1,
    } = await successfulRaise(signers, escrow, trustFactory, tier);

    // do second raise
    const { reserve: reserve2, buyCount: buyCount2 } = await successfulRaise(
      signers,
      escrow,
      trustFactory,
      tier
    );

    // recipient batch claims fees
    await escrow.connect(recipient).anonClaimFeesMulti(recipient.address, 10);

    const recipientReserve1FeesClaimed = await reserve1.balanceOf(
      recipient.address
    );
    const recipientReserve2FeesClaimed = await reserve2.balanceOf(
      recipient.address
    );

    const recipientFeesClaimed = recipientReserve1FeesClaimed.add(
      recipientReserve2FeesClaimed
    );

    const paidFees1 = fee.mul(buyCount1);
    const paidFees2 = fee.mul(buyCount2);

    const expectedFeesClaimed = paidFees1.add(paidFees2);

    assert(
      recipientFeesClaimed.eq(expectedFeesClaimed),
      `wrong total fee amount claimed
      expected  ${expectedFeesClaimed}
      got       ${recipientFeesClaimed}`
    );
  });

  it("should refund fees (via token contract) upon failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const {
      reserve,
      trust,
      recipient,
      signer1,
      minimumTradingDuration,
      redeemableERC20,
    } = await basicSetup(signers, trustFactory, tier);

    const startBlock = await ethers.provider.getBlockNumber();

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      await reserve.connect(signer).approve(escrow.address, spend.add(fee));

      await escrow
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

    // set min fee for the reserve that signer1 will be using
    await escrow.connect(recipient).recipientSetMinFees(reserve.address, fee);

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
    await trust.anonEndDistribution();

    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "raise wasn't failure"
    );

    // attempting claim fees is no-op.
    await escrow
      .connect(recipient)
      .anonClaimFees(recipient.address, trust.address);

    const reserveRedeemableERC20_1 = await reserve.balanceOf(
      redeemableERC20.address
    );

    const totalRefund = await escrow.failureRefunds(trust.address);

    // anyone can trigger refund.
    const refundFeesPromise = escrow
      .connect(signer1)
      .anonRefundFees(trust.address);

    // RefundFees event
    await expect(refundFeesPromise)
      .to.emit(escrow, "RefundFees")
      .withArgs(getAddress(trust.address), totalRefund);

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
      .redeem(await redeemableERC20.balanceOf(signer1.address));

    const signer1Reserve_2 = await reserve.balanceOf(signer1.address);

    assert(
      signer1Reserve_2.eq(spend.add(fee)),
      "signer1 should get full refund (spend AND fee from escrow contract)"
    );
  });

  it("should allow recipient to claim fees upon successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

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

    // set min fee for the reserve that signer1 will be using
    const setMinFeesPromise = escrow
      .connect(recipient)
      .recipientSetMinFees(reserve.address, fee);

    // MinFeesChange event (set)
    await expect(setMinFeesPromise)
      .to.emit(escrow, "MinFeesChange")
      .withArgs(recipient.address, getAddress(reserve.address), [0, fee]);

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
    await escrow
      .connect(recipient)
      .anonClaimFees(recipient.address, trust.address);

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

    // check fees are registered for trust and recipient
    const recipientFees1 = await escrow.fees(trust.address, recipient.address);
    assert(
      recipientFees1.eq(fee.mul(buyCount)),
      "wrong registered fee amount for trust and recipient"
    );

    // Attempting refund is no-op.
    await escrow.connect(signer1).anonRefundFees(trust.address);

    const claimableFee = await escrow.fees(trust.address, recipient.address);

    const claimFeesPromise = escrow
      .connect(recipient)
      .anonClaimFees(recipient.address, trust.address);

    // ClaimFees event
    await expect(claimFeesPromise)
      .to.emit(escrow, "ClaimFees")
      .withArgs(recipient.address, getAddress(trust.address), claimableFee);

    const reserveBalanceRecipient2 = await reserve.balanceOf(recipient.address);

    // check fees are deleted for trust and recipient
    const recipientFees2 = await escrow.fees(trust.address, recipient.address);
    assert(
      recipientFees2.isZero(),
      "did not delete fee amount for trust and recipient"
    );

    // recipient should have claimed fees after calling `anonClaimFees` after successful raise
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

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { reserve, trust, recipient, signer1 } = await basicSetup(
      signers,
      trustFactory,
      tier
    );

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      const reserveSigner = reserve.connect(signer);

      await reserveSigner.approve(escrow.address, spend.add(fee));

      const buyTokenPromise = escrow
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
        .to.emit(escrow, "Fee")
        .withArgs(recipient.address, getAddress(trust.address), fee);
    };

    const spend = ethers.BigNumber.from("250" + Util.sixZeros);
    const fee = ethers.BigNumber.from("10" + Util.sixZeros);

    // set min fee for the reserve that signer1 will be using
    await escrow.connect(recipient).recipientSetMinFees(reserve.address, fee);

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
      .anonClaimFees(recipient.address, trust.address);

    const reserveBalanceRecipient1 = await reserve.balanceOf(recipient.address);

    assert(
      reserveBalanceRecipient1.isZero(),
      `wrong recipient reserve balance
      expected  0 (no fee claimed)
      got       ${reserveBalanceRecipient1}`
    );
  });

  it("should check that trust address is child of trust factory when buying tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { reserve, trust, recipient, signer1 } = await basicSetup(
      signers,
      trustFactory,
      tier
    );

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      const reserveSigner = reserve.connect(signer);

      await reserveSigner.approve(escrow.address, spend.add(fee));

      await Util.assertError(
        async () =>
          await escrow.connect(signer).buyToken(
            recipient.address,
            signers[19].address, // bad trust address
            fee,
            spend,
            ethers.BigNumber.from("1"),
            ethers.BigNumber.from("1000000" + Util.eighteenZeros)
          ),
        "revert FACTORY_TRUST",
        "buyToken proceeded despite trust address not being child of factory"
      );

      await escrow
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

    // set min fee for the reserve that signer1 will be using
    await escrow.connect(recipient).recipientSetMinFees(reserve.address, fee);

    // signer1 uses a front end to buy token. Front end makes call to escrow contract so it takes a fee on behalf of recipient.
    await buyTokensViaEscrow(signer1, spend, fee);
  });
});
