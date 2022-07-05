import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { ReserveToken } from "../../typechain/ReserveToken";
import { BuyEvent } from "../../typechain/Sale";
import { SaleFactory } from "../../typechain/SaleFactory";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../utils/deploy/sale";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import { AllStandardOps } from "../../utils/rainvm/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/rainvm/sale";
import { op } from "../../utils/rainvm/vm";
import { assertError } from "../../utils/test/assertError";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale distribution on failed sale", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should transfer correct value to all stakeholders after failed sale (with forward address)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const feeRecipient = signers[3];
    const forwardingAddress = signers[4];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.CONSTANT, 0);
    const vStart = op(Opcode.CONSTANT, 1);
    const vEnd = op(Opcode.CONSTANT, 2);
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: forwardingAddress.address,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits = totalTokenSupply.div(2); // not all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    // buy some units
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );
    const tokenSupply0 = await token.totalSupply();
    const saleTokenBalance0 = await token.balanceOf(sale.address);
    const saleReserveBalance0 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance0 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance0 = await reserve.balanceOf(
      feeRecipient.address
    );
    const forwardingAddressTokenBalance0 = await token.balanceOf(
      forwardingAddress.address
    );
    assert(
      saleReserveBalance0.eq(cost.add(fee)),
      "sale should only hold reserve that signer1 transferred during buy"
    );
    assert(
      recipientReserveBalance0.isZero(),
      "recipient should have no initial reserve balance"
    );
    assert(
      feeRecipientReserveBalance0.isZero(),
      "fee recipient should not hold any reserve until claiming fees"
    );
    assert(
      forwardingAddressTokenBalance0.isZero(),
      "forwarding address should have no initial reserve balance"
    );
    await sale.end();
    // if distributionEndForwardingAddress, should forward distributor (sale) rTKN balance to distributionEndForwardingAddress
    //// else, should burn distributor (sale) rTKN balance
    // if failed sale, do not transfer all reserve to recipient
    const tokenSupply1 = await token.totalSupply();
    const saleTokenBalance1 = await token.balanceOf(sale.address);
    const saleReserveBalance1 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance1 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance1 = await reserve.balanceOf(
      feeRecipient.address
    );
    const forwardingAddressTokenBalance1 = await token.balanceOf(
      forwardingAddress.address
    );
    assert(
      tokenSupply0.eq(tokenSupply1),
      "no rTKN supply should have been burned"
    );
    assert(
      saleTokenBalance1.isZero(),
      "sale did not transfer entire rTKN balance"
    );
    assert(
      forwardingAddressTokenBalance1.eq(saleTokenBalance0),
      "forwarding address did not receive sale rTKN balance"
    );
    assert(
      saleReserveBalance1.eq(saleReserveBalance0),
      "sale reserve balance should remain the same on failed sale, ready to be refunded"
    );
    assert(
      recipientReserveBalance1.isZero(),
      "sale should not transfer reserve to recipient on failed sale"
    );
    assert(
      feeRecipientReserveBalance1.isZero(),
      "fee recipient should still not hold any reserve until claiming fees"
    );
    await assertError(
      async () => await sale.claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "should not allow fee recipient to claim fees"
    );
    const signer1ReserveBalance0 = await reserve.balanceOf(signer1.address);
    assert(
      signer1ReserveBalance0.isZero(),
      "signer1 should not automatically receive any refund at end of sale"
    );
    // signer1 refund
    await token.connect(signer1).approve(sale.address, desiredUnits);
    await sale.connect(signer1).refund(receipt);
    const signer1ReserveBalance1 = await reserve.balanceOf(signer1.address);
    assert(
      signer1ReserveBalance1.eq(cost.add(fee)),
      "signer1 should receive full refund on failed raise"
    );
  });

  it("should transfer correct value to all stakeholders after failed sale (no forward address)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const feeRecipient = signers[3];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.CONSTANT, 0);
    const vStart = op(Opcode.CONSTANT, 1);
    const vEnd = op(Opcode.CONSTANT, 2);
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits = totalTokenSupply.div(2); // not all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    // buy some units
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );
    const tokenSupply0 = await token.totalSupply();
    const saleTokenBalance0 = await token.balanceOf(sale.address);
    const saleReserveBalance0 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance0 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance0 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      saleReserveBalance0.eq(cost.add(fee)),
      "sale should only hold reserve that signer1 transferred during buy"
    );
    assert(
      recipientReserveBalance0.isZero(),
      "recipient should have no initial reserve balance"
    );
    assert(
      feeRecipientReserveBalance0.isZero(),
      "fee recipient should not hold any reserve until claiming fees"
    );
    await sale.end();
    //// if distributionEndForwardingAddress, should forward distributor (sale) rTKN balance
    // else, should burn distributor (sale) rTKN balance
    // if failed sale, do not transfer all reserve to recipient
    const tokenSupply1 = await token.totalSupply();
    const saleTokenBalance1 = await token.balanceOf(sale.address);
    const saleReserveBalance1 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance1 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance1 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      tokenSupply0.sub(tokenSupply1).eq(saleTokenBalance0),
      "wrong amount of rTKN supply burned"
    );
    assert(saleTokenBalance1.isZero(), "sale did not burn entire rTKN balance");
    assert(
      saleReserveBalance1.eq(saleReserveBalance0),
      "sale reserve balance should remain the same on failed sale, ready to be refunded"
    );
    assert(
      recipientReserveBalance1.isZero(),
      "sale should not transfer reserve to recipient on failed sale"
    );
    assert(
      feeRecipientReserveBalance1.isZero(),
      "fee recipient should still not hold any reserve until claiming fees"
    );
    await assertError(
      async () => await sale.claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "should not allow fee recipient to claim fees"
    );
    const signer1ReserveBalance0 = await reserve.balanceOf(signer1.address);
    assert(
      signer1ReserveBalance0.isZero(),
      "signer1 should not automatically receive any refund at end of sale"
    );
    // signer1 refund
    await token.connect(signer1).approve(sale.address, desiredUnits);
    await sale.connect(signer1).refund(receipt);
    const signer1ReserveBalance1 = await reserve.balanceOf(signer1.address);
    assert(
      signer1ReserveBalance1.eq(cost.add(fee)),
      "signer1 should receive full refund on failed raise"
    );
  });
});
