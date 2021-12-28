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

    const { trustFactory, tier, seedERC20Factory } = await deployGlobals();

    const { recipient, trust, bPoolFeeEscrow } = await basicSetup(
      signers,
      trustFactory,
      seedERC20Factory,
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

    const { trustFactory, tier, seedERC20Factory } = await deployGlobals();
    const { trustFactory: trustFactory2 } = await deployGlobals();

    const { recipient, trust, bPoolFeeEscrow } = await successfulRaise(
      signers,
      trustFactory,
      seedERC20Factory,
      tier
    );

    const { trust: unknownTrust } = await successfulRaise(
      signers,
      trustFactory2,
      seedERC20Factory,
      tier
    );

    const fees0 = await bPoolFeeEscrow.fees(trust.address, recipient.address);
    const feesUnknown0 = await bPoolFeeEscrow.fees(
      unknownTrust.address,
      recipient.address
    );
    const refunds0 = await bPoolFeeEscrow.refunds(trust.address);
    const refundsUnknown0 = await bPoolFeeEscrow.refunds(unknownTrust.address);

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
    const refunds1 = await bPoolFeeEscrow.refunds(trust.address);
    const refundsUnknown1 = await bPoolFeeEscrow.refunds(unknownTrust.address);

    const beforeState = [fees0, feesUnknown0, refunds0, refundsUnknown0];
    const afterState = [fees1, feesUnknown1, refunds1, refundsUnknown1];

    for (let i = 0; i < beforeState.length; i++) {
      const before = beforeState[i];
      const after = afterState[i];

      assert(before.eq(after), `${before} did not match ${after}, index ${i}`);
    }
  });

  it("should allow recipient to batch claim fees", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { trustFactory, tier, seedERC20Factory } = await deployGlobals();

    // do first raise
    const {
      reserve: reserve1,
      recipient,
      fee,
      buyCount: buyCount1,
      trust: trust1,
      bPoolFeeEscrow,
    } = await successfulRaise(signers, trustFactory, seedERC20Factory, tier);

    // do second raise
    const {
      reserve: reserve2,
      buyCount: buyCount2,
      trust: trust2,
    } = await successfulRaise(signers, trustFactory, seedERC20Factory, tier);

    const paidFees1 = fee.mul(buyCount1);
    const paidFees2 = fee.mul(buyCount2);

    const refundsTrust1 = await bPoolFeeEscrow.refunds(trust1.address);
    const refundsTrust2 = await bPoolFeeEscrow.refunds(trust2.address);

    assert(
      refundsTrust1.eq(paidFees1),
      `wrong aggregate fees for trust1
      expected  ${paidFees1}
      got       ${refundsTrust1}`
    );
    assert(
      refundsTrust2.eq(paidFees2),
      `wrong aggregate fees for trust2
      expected  ${paidFees2}
      got       ${refundsTrust2}`
    );
    assert(
      refundsTrust1.eq(refundsTrust2),
      `aggregate fees should match
      left  ${refundsTrust1}
      right ${refundsTrust2}`
    );

    // recipient batch claims fees
    await bPoolFeeEscrow
      .connect(recipient)
      .claimFeesMulti(recipient.address, [trust1.address, trust2.address]);

    const recipientReserve1FeesClaimed = await reserve1.balanceOf(
      recipient.address
    );
    const recipientReserve2FeesClaimed = await reserve2.balanceOf(
      recipient.address
    );

    const recipientFeesClaimed = recipientReserve1FeesClaimed.add(
      recipientReserve2FeesClaimed
    );

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

    const { trustFactory, tier, seedERC20Factory } = await deployGlobals();

    const {
      reserve,
      trust,
      recipient,
      signer1,
      minimumTradingDuration,
      redeemableERC20,
      bPoolFeeEscrow,
    } = await basicSetup(signers, trustFactory, seedERC20Factory, tier);

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

    // attempting claim fees is no-op.
    await bPoolFeeEscrow
      .connect(recipient)
      .claimFees(recipient.address, trust.address);

    const reserveRedeemableERC20_1 = await reserve.balanceOf(
      redeemableERC20.address
    );

    const totalRefund = await bPoolFeeEscrow.refunds(trust.address);

    // anyone can trigger refund.
    const refundFeesPromise = bPoolFeeEscrow
      .connect(signer1)
      .refundFees(trust.address);

    // RefundFees event
    await expect(refundFeesPromise)
      .to.emit(bPoolFeeEscrow, "RefundFees")
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

    const { trustFactory, seedERC20Factory, tier } = await deployGlobals();

    const {
      reserve,
      trust,
      recipient,
      signer1,
      bPoolFeeEscrow,
      fee,
      buyCount,
    } = await successfulRaise(signers, trustFactory, seedERC20Factory, tier);

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

    // Attempting refund is no-op.
    await bPoolFeeEscrow.connect(signer1).refundFees(trust.address);

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
      .withArgs(recipient.address, getAddress(trust.address), claimableFee);

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

    const { trustFactory, seedERC20Factory, tier } = await deployGlobals();

    // signer1 uses a front end to buy token. Front end makes call to bPoolFeeEscrow contract so it takes a fee on behalf of recipient.
    const { reserve, trust, recipient, bPoolFeeEscrow, fee } =
      await failedRaise(signers, trustFactory, seedERC20Factory, tier);

    const reserveBalanceEscrow1 = await reserve.balanceOf(
      bPoolFeeEscrow.address
    );

    assert(
      reserveBalanceEscrow1.eq(fee),
      `wrong bPoolFeeEscrow reserve balance
      expected  ${fee}
      got       ${reserveBalanceEscrow1}`
    );

    // no-op claim if raise is still ongoing
    await bPoolFeeEscrow
      .connect(recipient)
      .claimFees(recipient.address, trust.address);

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

    const { trustFactory, seedERC20Factory, tier } = await deployGlobals();

    const { reserve, trust, recipient, signer1, bPoolFeeEscrow } =
      await basicSetup(signers, trustFactory, seedERC20Factory, tier);

    const registeredTrustFactory = await bPoolFeeEscrow.trustedFactory();

    assert(
      registeredTrustFactory === getAddress(trustFactory.address),
      "trust factory was not correctly registered on construction"
    );

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
