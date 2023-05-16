import { strict as assert } from "assert";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory, ReadWriteTier, ReserveToken } from "../../typechain";
import {
  BuyEvent,
  RefundEvent,
  Sale,
} from "../../typechain/contracts/sale/Sale";
import { readWriteTierDeploy } from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { saleClone, saleImplementation } from "../../utils/deploy/sale/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import { assertError } from "../../utils/test/assertError";
import { Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale claim fees", async function () {
  let reserve: ReserveToken;
  let readWriteTier: ReadWriteTier;

  let cloneFactory: CloneFactory;
  let implementation: Sale;
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    readWriteTier = await readWriteTierDeploy();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();

    implementation = await saleImplementation(cloneFactory);
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should prevent recipient claiming fees on failed raise, allowing buyers to refund their tokens", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, feeRecipient] = signers;

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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.context, 0x0001), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale, token] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig,
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
    const desiredUnits = totalTokenSupply.div(10);
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    const initialBalance = await reserve.balanceOf(signer1.address);
    // buy _some_ units; insufficient raise amount
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
    // recipient cannot claim before sale ended with status of success
    await assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed before sale ended with status of success"
    );
    await sale.end();
    const saleStatusFail = await sale.saleStatus();
    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );
    // recipient cannot claim after sale ended with status of fail
    await assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed after sale ended with status of fail"
    );
    await token.connect(signer1).approve(sale.address, receipt.units);
    await assertError(
      async () => await sale.connect(signer1).refund({ ...receipt, id: 123 }),
      "Error",
      "wrongly processed refund with invalid receipt"
    );
    const balanceBeforeRefund = await reserve.balanceOf(signer1.address);
    // signer1 gets refund
    const refundTx = await sale.connect(signer1).refund(receipt);
    const balanceAfterRefund = await reserve.balanceOf(signer1.address);
    const { sender, receipt: eventReceipt } = (await getEventArgs(
      refundTx,
      "Refund",
      sale
    )) as RefundEvent["args"];
    assert(
      balanceAfterRefund.sub(balanceBeforeRefund).eq(initialBalance),
      "wrong refund amount"
    );
    assert(sender === signer1.address, "wrong sender in Refund event");
    assert(
      JSON.stringify(eventReceipt) === JSON.stringify(receipt),
      "wrong receipt in Refund event"
    );
    await assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "Error",
      "sender1 refunded same receipt twice"
    );
  });

  it("should allow fees recipient to claim fees on successful raise, and prevent buyers from refunding their tokens", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, feeRecipient] = signers;

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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.context, 0x0001), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig,
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
    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    // buy all units to meet minimum raise amount
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
    // sale should automatically have ended after all units bought
    const saleStatusSuccess = await sale.saleStatus();
    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );
    await assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "REFUND_SUCCESS",
      "signer1 wrongly refunded when raise was Successful"
    );
    const feeRecipientBalance0 = await reserve.balanceOf(feeRecipient.address);
    await sale.connect(feeRecipient).claimFees(feeRecipient.address);
    const feeRecipientBalance1 = await reserve.balanceOf(feeRecipient.address);
    // claiming again should not change feeRecipient balance as `fees[recipient_]` was deleted
    await sale.connect(feeRecipient).claimFees(feeRecipient.address);
    const feeRecipientBalance2 = await reserve.balanceOf(feeRecipient.address);
    assert(feeRecipientBalance0.eq(0));
    assert(feeRecipientBalance1.eq(fee));
    assert(feeRecipientBalance2.eq(feeRecipientBalance1));
  });
});
