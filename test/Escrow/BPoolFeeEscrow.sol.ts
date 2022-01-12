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

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

describe("BPoolFeeEscrow", async function () {
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

  it("should revert if unknown trust is claimed against", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();
    const { trustFactory: trustFactory2 } = await deployGlobals();

    const { recipient, trust, bPoolFeeEscrow } = await successfulRaise(
      signers,
      trustFactory,
      tier
    );

    const { trust: unknownTrust } = await successfulRaise(
      signers,
      trustFactory2,
      tier
    );

    const fees0 = await bPoolFeeEscrow.fees(trust.address, recipient.address);
    const feesUnknown0 = await bPoolFeeEscrow.fees(
      unknownTrust.address,
      recipient.address
    );
    const totalFees0 = await bPoolFeeEscrow.totalFees(trust.address);
    const totalFeesUnknown0 = await bPoolFeeEscrow.totalFees(
      unknownTrust.address
    );

    await Util.assertError(
      async () =>
        await bPoolFeeEscrow.connect(recipient).claimFees(
          recipient.address,
          unknownTrust.address // unknown trust created by different trust factory
        ),
      "NOT_TRUSTED_CHILD",
      "wrongly claimed fees against unknown trust"
    );

    const fees1 = await bPoolFeeEscrow.fees(trust.address, recipient.address);
    const feesUnknown1 = await bPoolFeeEscrow.fees(
      unknownTrust.address,
      recipient.address
    );
    const totalFees1 = await bPoolFeeEscrow.totalFees(trust.address);
    const totalFeesUnknown1 = await bPoolFeeEscrow.totalFees(
      unknownTrust.address
    );

    const beforeState = [fees0, feesUnknown0, totalFees0, totalFeesUnknown0];
    const afterState = [fees1, feesUnknown1, totalFees1, totalFeesUnknown1];

    for (let i = 0; i < beforeState.length; i++) {
      const before = beforeState[i];
      const after = afterState[i];

      assert(before.eq(after), `${before} did not match ${after}, index ${i}`);
    }
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

    const totalRefund = await bPoolFeeEscrow.totalFees(trust.address);

    // anyone can trigger refund.
    const refundFeesPromise = bPoolFeeEscrow
      .connect(signer1)
      .refundFees(trust.address);

    // RefundFees event
    await expect(refundFeesPromise)
      .to.emit(bPoolFeeEscrow, "RefundFees")
      .withArgs(signer1.address, getAddress(trust.address), totalRefund);

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

    assert(
      signer1Reserve_2.eq(spend.add(fee)),
      "signer1 should get full refund (spend AND fee from escrow contract)"
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

    // check fees are registered for trust and recipient
    const recipientFees1 = await bPoolFeeEscrow.fees(
      trust.address,
      recipient.address
    );
    assert(
      recipientFees1.eq(fee.mul(buyCount)),
      "wrong registered fee amount for trust and recipient"
    );

    // Attempting refund on successful raise should revert
    await Util.assertError(
      async () =>
        await bPoolFeeEscrow.connect(signer1).refundFees(trust.address),
      "NOT_FAIL",
      "wrongly refunded fees after successful raise"
    );

    const claimableFee = await bPoolFeeEscrow.fees(
      trust.address,
      recipient.address
    );

    const claimFeesPromise = bPoolFeeEscrow
      .connect(recipient)
      .claimFees(recipient.address, trust.address);

    // ClaimFees event
    await expect(claimFeesPromise)
      .to.emit(bPoolFeeEscrow, "ClaimFees")
      .withArgs(
        recipient.address,
        recipient.address,
        getAddress(trust.address),
        claimableFee
      );

    const reserveBalanceRecipient2 = await reserve.balanceOf(recipient.address);

    // check fees are deleted for trust and recipient
    const recipientFees2 = await bPoolFeeEscrow.fees(
      trust.address,
      recipient.address
    );
    assert(
      recipientFees2.isZero(),
      "did not delete fee amount for trust and recipient"
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

  it("should check that trust address is child of trust factory when buying tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier } = await deployGlobals();

    const { reserve, trust, recipient, signer1, bPoolFeeEscrow } =
      await basicSetup(signers, trustFactory, tier);

    const buyTokensViaEscrow = async (signer, spend, fee) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend.add(fee));

      const reserveSigner = reserve.connect(signer);

      await reserveSigner.approve(bPoolFeeEscrow.address, spend.add(fee));

      await Util.assertError(
        async () =>
          await bPoolFeeEscrow.connect(signer).buyToken(
            recipient.address,
            signers[19].address, // bad trust address
            fee,
            spend,
            ethers.BigNumber.from("1"),
            ethers.BigNumber.from("1000000" + Util.eighteenZeros)
          ),
        "NOT_TRUSTED_CHILD",
        "buyToken proceeded despite trust address not being child of factory"
      );

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

    // signer1 uses a front end to buy token. Front end makes call to escrow contract so it takes a fee on behalf of recipient.
    await buyTokensViaEscrow(signer1, spend, fee);
  });
});
