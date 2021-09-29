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

describe.only("BPoolFeeEscrow", async function () {
  it.only("should still refund abandoned fees on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const { escrow, trustFactory, tier } = await deployGlobals();

    const { recipient, trust, spend, fee, reserve, signer1, redeemableERC20 } =
      await failedRaise(signers, escrow, trustFactory, tier);

    // should have correct fee in escrow
    assert((await escrow.fees(trust.address, recipient.address)).eq(fee));
    assert((await escrow.abandoned(trust.address)).isZero());
    assert((await escrow.failureRefunds(trust.address)).eq(fee));

    await escrow.connect(recipient).abandonTrust(trust.address);

    assert((await escrow.fees(trust.address, recipient.address)).isZero());
    assert((await escrow.abandoned(trust.address)).eq(fee));
    assert((await escrow.failureRefunds(trust.address)).isZero());

    const reserveOnTokenBefore = await reserve.balanceOf(
      redeemableERC20.address
    );

    // a recipient abandoning fees should not prevent them being refunded after a failed raise
    await escrow.connect(signer1).refundFees(trust.address);

    const reserveOnTokenAfter = await reserve.balanceOf(
      redeemableERC20.address
    );

    const expectedRefund = spend.add(fee);
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

    await escrow.connect(recipient).abandonTrust(trust.address);

    // recipient no longer has claimable fees for this trust
    assert((await escrow.fees(trust.address, recipient.address)).isZero());
    assert((await escrow.abandoned(trust.address)).eq(totalFee));

    assert((await reserve.balanceOf(recipient.address)).isZero());

    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

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
    await escrow.connect(recipient).claimFeesMulti(recipient.address, 10);

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
    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

    const reserveRedeemableERC20_1 = await reserve.balanceOf(
      redeemableERC20.address
    );

    // anyone can trigger refund.
    await escrow.connect(signer1).refundFees(trust.address);

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

    // check fees are registered for trust and recipient
    const recipientFees1 = await escrow.fees(trust.address, recipient.address);
    assert(
      recipientFees1.eq(fee.mul(buyCount)),
      "wrong registered fee amount for trust and recipient"
    );

    // Attempting refund is no-op.
    await escrow.connect(signer1).refundFees(trust.address);

    await escrow.connect(recipient).claimFees(trust.address, recipient.address);

    const reserveBalanceRecipient2 = await reserve.balanceOf(recipient.address);

    // check fees are deleted for trust and recipient
    const recipientFees2 = await escrow.fees(trust.address, recipient.address);
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
