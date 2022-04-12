import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import type {
  BountyConfigStruct,
  ClearEvent,
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

const { assert } = chai;

const TRACK_CLEARED_ORDER = 0x1;
const TRACK_CLEARED_COUNTERPARTY = 0x2;

let orderBookFactory: ContractFactory,
  tokenA: ReserveToken18 & Contract,
  tokenB: ReserveToken18 & Contract;

describe("OrderBook", async function () {
  beforeEach(async () => {
    tokenA = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
    tokenB = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("order clearer should receive correct bounty amounts in their vaults, and can withdraw their vault balance for each token", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[4]; // order clearer

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const bountyBotVaultA = ethers.BigNumber.from(5);
    const bountyBotVaultB = ethers.BigNumber.from(6);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();
    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.VAL, 0);
    const vAskBlock = op(Opcode.VAL, 1);
    const v5 = op(Opcode.VAL, 2);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
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
    const expectedBounty = 1;
    const expectedOutputAmount = (blockClear0 - askBlock) * 5 - expectedBounty;
    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput0 },
    } = (await Util.getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    assert(
      bInput0.eq(expectedOutputAmount),
      `did not throttle asker output amount correctly
      expected  ${expectedOutputAmount}
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const carolInputVault = ethers.BigNumber.from(5);
    const carolOutputVault = ethers.BigNumber.from(6);
    const bountyBotVaultA = ethers.BigNumber.from(7);
    const bountyBotVaultB = ethers.BigNumber.from(8);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();

    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.VAL, 0);
    const vAskBlock = op(Opcode.VAL, 1);
    const v5 = op(Opcode.VAL, 2);
    // prettier-ignore
    const askSource = concat([
      // outputMax = (currentBlock - askBlock) * 5 - bidderCleared
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
      tracking: TRACK_CLEARED_COUNTERPARTY,
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
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

    // BID ORDER - CAROL

    const carolOutputMax = Util.max_uint256;
    const carolPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const carolConstants = [carolOutputMax, carolPrice];
    const vCarolOutputMax = op(Opcode.VAL, 0);
    const vCarolPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [carolSource],
        constants: carolConstants,
        arguments: [],
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
    const expectedBounty0 = 1;
    const expectedOutputAmount0 =
      (blockClear0 - askBlock) * 5 - expectedBounty0;

    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput0 },
    } = (await Util.getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
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

    // clear again
    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput1 },
    } = (await Util.getEventArgs(
      txClearOrder1,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    assert(
      bInput1.eq(1),
      `did not throttle bidder input amount correctly
      expected  ${1}
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
    const blockClear1 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty1 = 1;
    const expectedOutputAmount1 =
      (blockClear1 - askBlock) * 5 - expectedBounty1;

    const txClearOrder2 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, carolConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput2 },
    } = (await Util.getEventArgs(
      txClearOrder2,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    assert(
      bInput2.eq(expectedOutputAmount1),
      `did not throttle Carol bidder input amount correctly
      expected  ${expectedOutputAmount1}
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
  });

  it("should expose tracked data to RainVM calculations (e.g. asker throttles output of their tokens to 5 tokens per block)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const bountyBotVaultA = ethers.BigNumber.from(5);
    const bountyBotVaultB = ethers.BigNumber.from(6);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askBlock = await ethers.provider.getBlockNumber();

    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.VAL, 0);
    const vAskBlock = op(Opcode.VAL, 1);
    const v5 = op(Opcode.VAL, 2);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
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
    const expectedBounty = 1;
    const expectedOutputAmount = (blockClear0 - askBlock) * 5 - expectedBounty;

    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput0 },
    } = (await Util.getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    assert(
      bInput0.eq(expectedOutputAmount),
      `did not throttle asker output amount correctly
      expected  ${expectedOutputAmount}
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
    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
    const {
      stateChange: { bInput: bInput1 },
    } = (await Util.getEventArgs(
      txClearOrder1,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    assert(
      bInput1.eq(1),
      `did not throttle asker output amount correctly
      expected  ${1}
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const carolInputVault = ethers.BigNumber.from(5);
    const carolOutputVault = ethers.BigNumber.from(6);
    const bountyBotVaultA = ethers.BigNumber.from(7);
    const bountyBotVaultB = ethers.BigNumber.from(8);

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
    const vAskOutputMax = op(Opcode.VAL, 0);
    const vAskOutputMaxIfNotMatch = op(Opcode.VAL, 1);
    const vAskPrice = op(Opcode.VAL, 2);
    const vExpectedCounterparty = op(Opcode.VAL, 3);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
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
    const vBidOutputMaxCarol = op(Opcode.VAL, 0);
    const vBidPriceCarol = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSourceCarol],
        constants: bidConstantsCarol,
        arguments: [],
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
      stateChange: clearStateChange,
    } = (await Util.getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];

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

  it("should support removing orders iff they interface with non-append-only vaults", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(-4);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askConstants = [Util.max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.VAL, 0);
    const vAskPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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

    // REMOVE ASK ORDER (only non-append-only vaults)

    const txAskOrderDead = await orderBook
      .connect(alice)
      .removeOrder(askOrderConfig);

    const { sender: askDeadSender, config: askDeadConfig } =
      (await Util.getEventArgs(
        txAskOrderDead,
        "OrderDead",
        orderBook
      )) as OrderDeadEvent["args"];

    assert(askDeadSender === alice.address, "wrong sender");
    Util.compareStructs(askDeadConfig, askOrderConfig);

    // BID ORDER

    const bidPrice = Util.fixedPointDiv(Util.ONE, askPrice);
    const bidConstants = [Util.max_uint256, bidPrice];
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidLiveSender, config: bidLiveConfig } =
      (await Util.getEventArgs(
        txBidOrderLive,
        "OrderLive",
        orderBook
      )) as OrderLiveEvent["args"];

    assert(bidLiveSender === bob.address, "wrong sender");
    Util.compareStructs(bidLiveConfig, bidOrderConfig);

    // REMOVE BID ORDER (has append-only output vault)

    await Util.assertError(
      async () => await orderBook.connect(bob).removeOrder(bidOrderConfig),
      "APPEND_ONLY_VAULT_ID",
      "wrongly removed order with append-only output vault"
    );
  });

  it("should allow withdrawals from non-append-only vault, and prevent withdrawals from append-only vaults", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const appendVault = ethers.BigNumber.from(-1);
    const nonAppendVault = ethers.BigNumber.from(1);

    // DEPOSITS

    const amountAppend = ethers.BigNumber.from("1000" + Util.eighteenZeros);
    const amountNonAppend = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    await tokenA.transfer(alice.address, amountAppend);
    await tokenB.transfer(alice.address, amountNonAppend);

    const depositConfigStructAppend: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenA.address,
      vaultId: appendVault,
      amount: amountAppend,
    };
    const depositConfigStructNonAppend: DepositConfigStruct = {
      depositor: alice.address,
      token: tokenB.address,
      vaultId: nonAppendVault,
      amount: amountNonAppend,
    };

    await tokenA
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAppend.amount);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructNonAppend.amount);

    // Alice deposits tokenA into her append-only vault
    const txDepositAppend = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAppend);
    // Alice deposits tokenB into her non-append-only vault
    const txDepositNonAppend = await orderBook
      .connect(alice)
      .deposit(depositConfigStructNonAppend);

    const { sender: depositAppendSender, config: depositAppendConfig } =
      (await Util.getEventArgs(
        txDepositAppend,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositNonAppendSender, config: depositNonAppendConfig } =
      (await Util.getEventArgs(
        txDepositNonAppend,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAppendSender === alice.address);
    Util.compareStructs(depositAppendConfig, depositConfigStructAppend);
    assert(depositNonAppendSender === alice.address);
    Util.compareStructs(depositNonAppendConfig, depositConfigStructNonAppend);

    const aliceTokenABalance0 = await tokenA.balanceOf(alice.address);
    const aliceTokenBBalance0 = await tokenB.balanceOf(alice.address);

    const withdrawConfigAppend: WithdrawConfigStruct = {
      token: tokenA.address,
      vaultId: appendVault,
      amount: amountAppend,
    };
    const withdrawConfigNonAppend: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: nonAppendVault,
      amount: amountNonAppend,
    };

    await Util.assertError(
      async () => await orderBook.connect(alice).withdraw(withdrawConfigAppend),
      "APPEND_ONLY_VAULT_ID",
      "alice wrongly withdrew from append-only vault"
    );

    const txWithdraw = await orderBook
      .connect(alice)
      .withdraw(withdrawConfigNonAppend);

    const { sender: withdrawSender, config: withdrawConfig } =
      (await Util.getEventArgs(
        txWithdraw,
        "Withdraw",
        orderBook
      )) as WithdrawEvent["args"];

    assert(withdrawSender === alice.address);
    Util.compareStructs(withdrawConfig, withdrawConfigNonAppend);

    const aliceTokenABalance1 = await tokenA.balanceOf(alice.address);
    const aliceTokenBBalance1 = await tokenB.balanceOf(alice.address);

    assert(aliceTokenABalance0.isZero());
    assert(aliceTokenABalance1.isZero());

    assert(aliceTokenBBalance0.isZero());
    assert(aliceTokenBBalance1.eq(amountNonAppend));
  });

  it("should add ask and bid orders and clear the order", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const bountyBotVaultA = ethers.BigNumber.from(5);
    const bountyBotVaultB = ethers.BigNumber.from(6);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
    const askConstants = [Util.max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.VAL, 0);
    const vAskPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [askSource],
        constants: askConstants,
        arguments: [],
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
    const vBidOutputMax = op(Opcode.VAL, 0);
    const vBidPrice = op(Opcode.VAL, 1);
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
      vmState: {
        stackIndex: 0,
        stack: [0, 0],
        sources: [bidSource],
        constants: bidConstants,
        arguments: [],
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
      stateChange: clearStateChange,
    } = (await Util.getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];

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
