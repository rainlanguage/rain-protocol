import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AfterClearEvent,
  BountyConfigStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderBook,
  OrderConfigStruct,
  OrderLiveEvent,
  WithdrawConfigStruct,
} from "../../../typechain/OrderBook";
import { OrderBookStateBuilder } from "../../../typechain/OrderBookStateBuilder";
import { ReserveToken18 } from "../../../typechain/ReserveToken18";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../../utils/constants/bigNumber";
import { TRACK_CLEARED_COUNTERPARTY } from "../../../utils/constants/orderbook";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { fixedPointDiv } from "../../../utils/math";
import { OrderBookOpcode } from "../../../utils/rainvm/ops/orderBookOps";
import { op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = OrderBookOpcode;

describe("OrderBook tracking counterparty funds cleared", async function () {
  const cOrderHash = op(Opcode.CONTEXT, 0);
  const cCounterparty = op(Opcode.CONTEXT, 1);

  let orderBookFactory: ContractFactory,
    tokenA: ReserveToken18,
    tokenB: ReserveToken18,
    stateBuilder: OrderBookStateBuilder;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
  });

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "OrderBookStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as OrderBookStateBuilder;
    await stateBuilder.deployed();

    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should expose tracked data to RainVM calculations (e.g. asker throttles output of their tokens to 5 tokens per block per bidder)", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const carolInputVault = ethers.BigNumber.from(1);
    const carolOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();

    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.CONSTANT, 0);
    const vAskBlock = op(Opcode.CONSTANT, 1);
    const v5 = op(Opcode.CONSTANT, 2);
    // prettier-ignore
    const askSource = concat([
      // outputMax = (currentBlock - askBlock) * 5 - bidderCleared
      // 5 tokens available per block
            op(Opcode.BLOCK_NUMBER),
            vAskBlock,
          op(Opcode.SUB, 2),
          v5,
        op(Opcode.MUL, 2),
          cOrderHash,
          cCounterparty,
        op(Opcode.COUNTERPARTY_FUNDS_CLEARED),
      op(Opcode.SUB, 2),
      vAskPrice,
    ]);

    const askOrderConfig: OrderConfigStruct = {
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      // tracking: TRACK_CLEARED_COUNTERPARTY,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    compareStructs(askConfig, askOrderConfig);

    // BID ORDER - BOB

    const bidOutputMax = max_uint256;
    const bidPrice = fixedPointDiv(ONE, askPrice);
    const bidConstants = [bidOutputMax, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      // tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bobConfig } = (await getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bobConfig, bidOrderConfig);

    // BID ORDER - CAROL

    const carolOutputMax = max_uint256;
    const carolPrice = fixedPointDiv(ONE, askPrice);
    const carolConstants = [carolOutputMax, carolPrice];
    const vCarolOutputMax = op(Opcode.CONSTANT, 0);
    const vCarolPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const carolSource = concat([
      vCarolOutputMax,
      vCarolPrice,
    ]);
    const carolOrderConfig: OrderConfigStruct = {
      inputToken: tokenB.address,
      inputVaultId: carolInputVault,
      outputToken: tokenA.address,
      outputVaultId: carolOutputVault,
      // tracking: 0x0,
      vmStateConfig: {
        sources: [carolSource],
        constants: carolConstants,
      },
    };

    const txCarolOrderLive = await orderBook
      .connect(carol)
      .addOrder(carolOrderConfig);

    const { sender: carolSender, config: carolConfig } = (await getEventArgs(
      txCarolOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(carolSender === carol.address, "wrong sender");
    compareStructs(carolConfig, carolOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.transfer(carol.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };
    const depositConfigStructCarol: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: carolOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);
    await tokenA
      .connect(carol)
      .approve(orderBook.address, depositConfigStructCarol.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);
    // Carol deposits tokenA into her output vault
    const txDepositOrderCarol = await orderBook
      .connect(carol)
      .deposit(depositConfigStructCarol);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositCarolSender, config: depositCarolConfig } =
      (await getEventArgs(
        txDepositOrderCarol,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    compareStructs(depositBobConfig, depositConfigStructBob);
    assert(depositCarolSender === carol.address);
    compareStructs(depositCarolConfig, depositConfigStructCarol);

    // BOUNTY BOT CLEARS THE ORDERS

    const bountyConfig: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    const blockClear0 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty0 = { a: 1, b: 0 };
    const expectedOutputAmount0 =
      (blockClear0 - askBlock) * 5 - expectedBounty0.a;

    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bobConfig, bountyConfig);
    const { stateChange: stateChange0 } = (await getEventArgs(
      txClearOrder0,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];
    const { bInput: bInput0 } = stateChange0;

    const actualBounty0 = {
      a: stateChange0.aOutput.sub(stateChange0.bInput),
      b: stateChange0.bOutput.sub(stateChange0.aInput),
    };

    assert(
      bInput0.eq(expectedOutputAmount0),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount0}
      got       ${bInput0}`
    );

    const withdrawConfig0: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput0,
    };
    const bobTokenBBalance0 = await tokenB.balanceOf(bob.address);
    await orderBook.connect(bob).withdraw(withdrawConfig0);
    const bobTokenBBalance1 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance0.isZero());
    assert(bobTokenBBalance1.eq(bInput0));

    // clear Bob order again
    const blockClear1 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty1 = { a: 1, b: 0 };
    const expectedOutputAmount1 =
      (blockClear1 - askBlock) * 5 -
      expectedBounty1.a -
      expectedOutputAmount0 -
      expectedBounty0.a;

    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bobConfig, bountyConfig);
    const { stateChange: stateChange1 } = (await getEventArgs(
      txClearOrder1,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];
    const { bInput: bInput1 } = stateChange1;

    const actualBounty1 = {
      a: stateChange1.aOutput.sub(stateChange1.bInput),
      b: stateChange1.bOutput.sub(stateChange1.aInput),
    };

    assert(
      bInput1.eq(expectedOutputAmount1),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount1}
      got       ${bInput1}`
    );

    const withdrawConfig1: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput1,
    };
    await orderBook.connect(bob).withdraw(withdrawConfig1);
    const bobTokenBBalance2 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance2.eq(bobTokenBBalance1.add(bInput1)));

    // Carol should receive full amount, should be independent of amount Bob received
    const blockClear2 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty2 = { a: 1, b: 0 };
    const expectedOutputAmount2 =
      (blockClear2 - askBlock) * 5 - expectedBounty2.a;

    const txClearOrder2 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, carolConfig, bountyConfig);
    const { stateChange: stateChange2 } = (await getEventArgs(
      txClearOrder2,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];
    const { bInput: bInput2 } = stateChange2;

    const actualBounty2 = {
      a: stateChange2.aOutput.sub(stateChange2.bInput),
      b: stateChange2.bOutput.sub(stateChange2.aInput),
    };

    assert(
      bInput2.eq(expectedOutputAmount2),
      `did not throttle Carol bidder input amount correctly
      expected  ${expectedOutputAmount2}
      got       ${bInput2}`
    );

    const withdrawConfig2: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: carolInputVault,
      amount: bInput2,
    };
    const carolTokenBBalance0 = await tokenB.balanceOf(carol.address);
    await orderBook.connect(carol).withdraw(withdrawConfig2);
    const carolTokenBBalance1 = await tokenB.balanceOf(carol.address);
    assert(carolTokenBBalance0.isZero());
    assert(carolTokenBBalance1.eq(bInput2));

    // clear Carol order again
    const blockClear3 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty3 = { a: 1, b: 0 };
    const expectedOutputAmount3 =
      (blockClear3 - askBlock) * 5 -
      expectedBounty3.a -
      expectedOutputAmount2 -
      expectedBounty2.a;

    const txClearOrder3 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, carolConfig, bountyConfig);
    const { stateChange: stateChange3 } = (await getEventArgs(
      txClearOrder3,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];
    const { bInput: bInput3 } = stateChange3;

    const actualBounty3 = {
      a: stateChange3.aOutput.sub(stateChange3.bInput),
      b: stateChange3.bOutput.sub(stateChange3.aInput),
    };

    assert(
      bInput3.eq(expectedOutputAmount3),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount3}
      got       ${bInput3}`
    );

    const withdrawConfig3: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput3,
    };
    await orderBook.connect(bob).withdraw(withdrawConfig3);
    const bobTokenBBalance4 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance4.eq(bobTokenBBalance1.add(bInput3)));
  });
});
