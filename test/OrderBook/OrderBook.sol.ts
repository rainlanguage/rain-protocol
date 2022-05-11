import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import type {
  BountyConfigStruct,
  ClearEvent,
  AfterClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderBook,
  OrderConfigStruct,
  OrderDeadEvent,
  OrderLiveEvent,
  WithdrawConfigStruct,
  WithdrawEvent,
} from "../../typechain/OrderBook";
import { ReserveToken18 } from "../../typechain/ReserveToken18";
import { Opcode } from "./OrderBookUtil";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import { OrderBookStateBuilder } from "../../typechain/OrderBookStateBuilder";

const { assert } = chai;

const TRACK_CLEARED_ORDER = 0x1;
const TRACK_CLEARED_COUNTERPARTY = 0x2;

let orderBookFactory: ContractFactory,
  tokenA: ReserveToken18 & Contract,
  tokenB: ReserveToken18 & Contract;

describe("OrderBook", async function () {
  let stateBuilder: OrderBookStateBuilder & Contract;

  beforeEach(async () => {
    tokenA = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
    tokenB = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
  });

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "OrderBookStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as OrderBookStateBuilder & Contract;
    await stateBuilder.deployed();

    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("order clearer should receive correct bounty amounts in their vaults, and can withdraw their vault balance for each token", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[4]; // order clearer

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();
    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.CONSTANT, 0);
    const vAskBlock = op(Opcode.CONSTANT, 1);
    const v5 = op(Opcode.CONSTANT, 2);
    // prettier-ignore
    const askSource = concat([
      // outputMax = (currentBlock - askBlock) * 5 - aliceCleared
      // 5 tokens available per block
            op(Opcode.BLOCK_NUMBER),
            vAskBlock,
          op(Opcode.SUB, 2),
          v5,
        op(Opcode.MUL, 2),
        op(Opcode.ORDER_FUNDS_CLEARED),
      op(Opcode.SUB, 2),
      vAskPrice,
    ]);

    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: TRACK_CLEARED_ORDER,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    Util.compareStructs(askConfig, askOrderConfig);

    // BID ORDER

    const bidOutputMax = Util.max_uint256;
    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [bidOutputMax, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    Util.compareStructs(bidConfig, bidOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      depositor: bob.address,
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await Util.getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await Util.getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    Util.compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    Util.compareStructs(depositBobConfig, depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

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
      .clear(askConfig, bidConfig, bountyConfig);
    const { stateChange: stateChange0 } = (await Util.getEventArgs(
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
      `did not throttle asker output amount correctly
      expected  ${expectedOutputAmount0}
      got       ${bInput0}`
    );
  });

  it("should expose tracked data to RainVM calculations (e.g. asker throttles output of their tokens to 5 tokens per block per bidder)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const carolInputVault = ethers.BigNumber.from(1);
    const carolOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
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
        op(Opcode.COUNTERPARTY_FUNDS_CLEARED),
      op(Opcode.SUB, 2),
      vAskPrice,
    ]);

    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: TRACK_CLEARED_COUNTERPARTY,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    Util.compareStructs(askConfig, askOrderConfig);

    // BID ORDER - BOB

    const bidOutputMax = Util.max_uint256;
    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [bidOutputMax, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bobConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    Util.compareStructs(bobConfig, bidOrderConfig);

    // BID ORDER - CAROL

    const carolOutputMax = Util.max_uint256;
    const carolPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const carolConstants = [carolOutputMax, carolPrice];
    const vCarolOutputMax = op(Opcode.CONSTANT, 0);
    const vCarolPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const carolSource = concat([
      vCarolOutputMax,
      vCarolPrice,
    ]);
    const carolOrderConfig: OrderConfigStruct = {
      owner: carol.address,
      inputToken: tokenB.address,
      inputVaultId: carolInputVault,
      outputToken: tokenA.address,
      outputVaultId: carolOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [carolSource],
        constants: carolConstants,
      },
    };

    const txCarolOrderLive = await orderBook
      .connect(carol)
      .addOrder(carolOrderConfig);

    const { sender: carolSender, config: carolConfig } =
      (await Util.getEventArgs(
        txCarolOrderLive,
        "OrderLive",
        orderBook
      )) as OrderLiveEvent["args"];

    assert(carolSender === carol.address, "wrong sender");
    Util.compareStructs(carolConfig, carolOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.transfer(carol.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      depositor: bob.address,
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };
    const depositConfigStructCarol: DepositConfigStruct = {
      depositor: carol.address,
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
      (await Util.getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await Util.getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositCarolSender, config: depositCarolConfig } =
      (await Util.getEventArgs(
        txDepositOrderCarol,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    Util.compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    Util.compareStructs(depositBobConfig, depositConfigStructBob);
    assert(depositCarolSender === carol.address);
    Util.compareStructs(depositCarolConfig, depositConfigStructCarol);

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
    const { stateChange: stateChange0 } = (await Util.getEventArgs(
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
    const { stateChange: stateChange1 } = (await Util.getEventArgs(
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
    const { stateChange: stateChange2 } = (await Util.getEventArgs(
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
    const { stateChange: stateChange3 } = (await Util.getEventArgs(
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

  it("should expose tracked data to RainVM calculations (e.g. asker throttles output of their tokens to 5 tokens per block)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();

    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.CONSTANT, 0);
    const vAskBlock = op(Opcode.CONSTANT, 1);
    const v5 = op(Opcode.CONSTANT, 2);
    // prettier-ignore
    const askSource = concat([
      // outputMax = (currentBlock - askBlock) * 5 - aliceCleared
      // 5 tokens available per block
            op(Opcode.BLOCK_NUMBER),
            vAskBlock,
          op(Opcode.SUB, 2),
          v5,
        op(Opcode.MUL, 2),
        op(Opcode.ORDER_FUNDS_CLEARED),
      op(Opcode.SUB, 2),
      vAskPrice,
    ]);

    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: TRACK_CLEARED_ORDER,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    Util.compareStructs(askConfig, askOrderConfig);

    // BID ORDER

    const bidOutputMax = Util.max_uint256;
    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [bidOutputMax, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    Util.compareStructs(bidConfig, bidOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      depositor: bob.address,
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await Util.getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await Util.getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    Util.compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    Util.compareStructs(depositBobConfig, depositConfigStructBob);

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
      .clear(askConfig, bidConfig, bountyConfig);
    const { stateChange: stateChange0 } = (await Util.getEventArgs(
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
      `did not throttle asker output amount correctly
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

    // clear again
    const blockClear1 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty1 = { a: 1, b: 0 };
    const expectedOutputAmount1 =
      (blockClear1 - askBlock) * 5 -
      expectedBounty1.a -
      expectedOutputAmount0 -
      expectedBounty0.a;

    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const { stateChange: stateChange1 } = (await Util.getEventArgs(
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
      `did not throttle asker output amount correctly
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
  });

  it("should expose counterparty to RainVM calculations (e.g. ask order will trigger revert if bid order counterparty does not match Carol's address)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const carolInputVault = ethers.BigNumber.from(1);
    const carolOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askOutputMax = Util.max_uint256;
    const askOutputMaxIfNotMatchingCounterparty = 0;

    const askConstants = [
      askOutputMax,
      askOutputMaxIfNotMatchingCounterparty,
      askPrice,
      carol.address,
    ];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskOutputMaxIfNotMatch = op(Opcode.CONSTANT, 1);
    const vAskPrice = op(Opcode.CONSTANT, 2);
    const vExpectedCounterparty = op(Opcode.CONSTANT, 3);
    // prettier-ignore
    const askSource = concat([
          op(Opcode.COUNTERPARTY),
          vExpectedCounterparty,
        op(Opcode.EQUAL_TO),
        vAskOutputMax,
        vAskOutputMaxIfNotMatch,
      op(Opcode.EAGER_IF),
      vAskPrice,
    ]);

    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    Util.compareStructs(askConfig, askOrderConfig);

    // BID ORDER - BAD MATCH

    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [Util.max_uint256, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    Util.compareStructs(bidConfig, bidOrderConfig);

    // BID ORDER - GOOD MATCH

    const bidPriceCarol = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstantsCarol = [Util.max_uint256, bidPriceCarol];
    const vBidOutputMaxCarol = op(Opcode.CONSTANT, 0);
    const vBidPriceCarol = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSourceCarol = concat([
      vBidOutputMaxCarol,
      vBidPriceCarol,
    ]);
    const bidOrderConfigCarol: OrderConfigStruct = {
      owner: carol.address,
      inputToken: tokenB.address,
      inputVaultId: carolInputVault,
      outputToken: tokenA.address,
      outputVaultId: carolOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSourceCarol],
        constants: bidConstantsCarol,
      },
    };

    const txBidOrderLiveCarol = await orderBook
      .connect(carol)
      .addOrder(bidOrderConfigCarol);

    const { sender: bidSenderCarol, config: bidConfigCarol } =
      (await Util.getEventArgs(
        txBidOrderLiveCarol,
        "OrderLive",
        orderBook
      )) as OrderLiveEvent["args"];

    assert(bidSenderCarol === carol.address, "wrong sender");
    Util.compareStructs(bidConfigCarol, bidOrderConfigCarol);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.transfer(carol.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      depositor: bob.address,
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };
    const depositConfigStructCarol: DepositConfigStruct = {
      depositor: carol.address,
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
      (await Util.getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await Util.getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositCarolSender, config: depositCarolConfig } =
      (await Util.getEventArgs(
        txDepositOrderCarol,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    Util.compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    Util.compareStructs(depositBobConfig, depositConfigStructBob);
    assert(depositCarolSender === carol.address);
    Util.compareStructs(depositCarolConfig, depositConfigStructCarol);

    // BOUNTY BOT CLEARS THE ORDER - BAD MATCH

    const bountyConfig: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    await Util.assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(askConfig, bidConfig, bountyConfig),
      "0_CLEAR",
      "should revert with 0 amount since bob does not match expected counterparty"
    );

    // BOUNTY BOT CLEARS THE ORDER - GOOD MATCH

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfigCarol, bountyConfig);

    const {
      sender: clearSender,
      a_: clearA_,
      b_: clearB_,
      bountyConfig: clearBountyConfig,
    } = (await Util.getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: clearStateChange } = (await Util.getEventArgs(
      txClearOrder,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected = amountA;
    const bOutputMaxExpected = amountB;

    const aOutputExpected = Util.minBN(
      aOutputMaxExpected,
      Util.fixedPointMul(bidPrice, amountA)
    );
    const bOutputExpected = Util.minBN(
      bOutputMaxExpected,
      Util.fixedPointMul(askPrice, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: Util.fixedPointMul(askPrice, aOutputExpected),
      bInput: Util.fixedPointMul(bidPrice, bOutputExpected),
    };

    assert(clearSender === bountyBot.address);
    Util.compareSolStructs(clearA_, askConfig);
    Util.compareSolStructs(clearB_, bidConfigCarol);
    Util.compareStructs(clearBountyConfig, bountyConfig);
    Util.compareStructs(clearStateChange, expectedClearStateChange);
  });

  it("should support removing orders", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askConstants = [Util.max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askLiveSender, config: askLiveConfig } =
      (await Util.getEventArgs(
        txAskOrderLive,
        "OrderLive",
        orderBook
      )) as OrderLiveEvent["args"];

    assert(askLiveSender === alice.address, "wrong sender");
    Util.compareStructs(askLiveConfig, askOrderConfig);

    // REMOVE ASK ORDER

    const txAskOrderDead = await orderBook
      .connect(alice)
      .removeOrder(askLiveConfig);

    const { sender: askDeadSender, config: askDeadConfig } =
      (await Util.getEventArgs(
        txAskOrderDead,
        "OrderDead",
        orderBook
      )) as OrderDeadEvent["args"];

    assert(askDeadSender === alice.address, "wrong sender");
    Util.compareStructs(askDeadConfig, askOrderConfig);
  });

  it("should allow withdrawals from vaults", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;
    const vaultId = ethers.BigNumber.from(1);

    // DEPOSITS

    const amount = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    await tokenA.transfer(alice.address, amount);

    const depositConfigStruct: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenA.address,
      vaultId,
      amount,
    };

    await tokenA
      .connect(alice)
      .approve(orderBook.address, depositConfigStruct.amount);

    // Alice deposits tokenA into her non-append-only vault
    const txDeposit = await orderBook
      .connect(alice)
      .deposit(depositConfigStruct);

    const { sender: depositSender, config: depositConfig } =
      (await Util.getEventArgs(
        txDeposit,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositSender === alice.address);
    Util.compareStructs(depositConfig, depositConfigStruct);

    const aliceTokenABalance0 = await tokenA.balanceOf(alice.address);

    const withdrawConfigStruct: WithdrawConfigStruct = {
      token: tokenA.address,
      vaultId: vaultId,
      amount,
    };

    const txWithdraw = await orderBook
      .connect(alice)
      .withdraw(withdrawConfigStruct);

    const { sender: withdrawSender, config: withdrawConfig } =
      (await Util.getEventArgs(
        txWithdraw,
        "Withdraw",
        orderBook
      )) as WithdrawEvent["args"];

    assert(withdrawSender === alice.address);
    Util.compareStructs(withdrawConfig, withdrawConfigStruct);

    const aliceTokenABalance1 = await tokenA.balanceOf(alice.address);

    assert(aliceTokenABalance0.isZero());
    assert(aliceTokenABalance1.eq(amount));
  });

  it("should add ask and bid orders and clear the order", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askConstants = [Util.max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    Util.compareStructs(askConfig, askOrderConfig);

    // BID ORDER

    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [Util.max_uint256, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: bobInputVault,
      outputToken: tokenA.address,
      outputVaultId: bobOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    Util.compareStructs(bidConfig, bidOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      depositor: bob.address,
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await Util.getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await Util.getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    Util.compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    Util.compareStructs(depositBobConfig, depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

    const bountyConfig: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);

    const {
      sender: clearSender,
      a_: clearA_,
      b_: clearB_,
      bountyConfig: clearBountyConfig,
    } = (await Util.getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: clearStateChange } = (await Util.getEventArgs(
      txClearOrder,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected = amountA;
    const bOutputMaxExpected = amountB;

    const aOutputExpected = Util.minBN(
      aOutputMaxExpected,
      Util.fixedPointMul(bidPrice, amountA)
    );
    const bOutputExpected = Util.minBN(
      bOutputMaxExpected,
      Util.fixedPointMul(askPrice, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: Util.fixedPointMul(askPrice, aOutputExpected),
      bInput: Util.fixedPointMul(bidPrice, bOutputExpected),
    };

    assert(clearSender === bountyBot.address);
    Util.compareSolStructs(clearA_, askConfig);
    Util.compareSolStructs(clearB_, bidConfig);
    Util.compareStructs(clearBountyConfig, bountyConfig);
    Util.compareStructs(clearStateChange, expectedClearStateChange);
  });
});
