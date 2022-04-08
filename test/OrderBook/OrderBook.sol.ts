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

  // should expose counterparty to RainVM calculations

  it("should expose tracked data to RainVM calculations", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];
    const carol = signers[4];
    const dave = signers[5];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(3);
    const bobOutputVault = ethers.BigNumber.from(4);
    const bountyBotVaultA = ethers.BigNumber.from(5);
    const bountyBotVaultB = ethers.BigNumber.from(6);
    const carolInputVault = ethers.BigNumber.from(7);
    const carolOutputVault = ethers.BigNumber.from(8);
    const daveInputVault = ethers.BigNumber.from(9);
    const daveOutputVault = ethers.BigNumber.from(10);

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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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

    const { config: askConfig } = (await Util.getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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

    const { config: bidConfig } = (await Util.getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

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
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

    const bountyConfig0: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig0);

    // CAROL ORDER - ORDER FUNDS CLEARED

    const carolPriceIfCleared = ethers.BigNumber.from("1" + Util.eighteenZeros);
    const carolPriceIfNotCleared = ethers.BigNumber.from(
      "2" + Util.eighteenZeros
    );
    const carolConstants = [
      Util.max_uint256,
      carolPriceIfCleared,
      carolPriceIfNotCleared,
    ];
    const vCarolOutputMax = op(Opcode.VAL, 0);
    const vCarolPriceIfCleared = op(Opcode.VAL, 1);
    const vCarolPriceIfNotCleared = op(Opcode.VAL, 2);
    // prettier-ignore
    const carolSource = concat([
      vCarolOutputMax,
        op(Opcode.OPCODE_ORDER_FUNDS_CLEARED),
        vCarolPriceIfCleared,
        vCarolPriceIfNotCleared,
      op(Opcode.EAGER_IF)
    ]);
    const carolOrderConfig: OrderConfigStruct = {
      owner: carol.address,
      inputToken: tokenA.address,
      inputVaultId: carolInputVault,
      outputToken: tokenB.address,
      outputVaultId: carolOutputVault,
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
      vmState: {
        stackIndex: 0,
        stack: [0, 0, 0, 0, 0, 0, 0, 0],
        sources: [carolSource],
        constants: carolConstants,
        arguments: [],
      },
    };

    const txCarolOrderLive = await orderBook
      .connect(carol)
      .addOrder(carolOrderConfig);

    const { config: carolConfig } = (await Util.getEventArgs(
      txCarolOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    // DAVE ORDER - COUNTERPARTY FUNDS CLEARED

    const davePriceIfCleared = ethers.BigNumber.from("1" + Util.eighteenZeros);
    const davePriceIfNotCleared = ethers.BigNumber.from(
      "2" + Util.eighteenZeros
    );
    const daveConstants = [
      Util.max_uint256,
      davePriceIfCleared,
      davePriceIfNotCleared,
    ];
    const vDaveOutputMax = op(Opcode.VAL, 0);
    const vDavePriceIfCleared = op(Opcode.VAL, 1);
    const vDavePriceIfNotCleared = op(Opcode.VAL, 2);
    // prettier-ignore
    const daveSource = concat([
      vDaveOutputMax,
        op(Opcode.OPCODE_COUNTERPARTY_FUNDS_CLEARED),
        vDavePriceIfCleared,
        vDavePriceIfNotCleared,
      op(Opcode.EAGER_IF)
    ]);
    const daveOrderConfig: OrderConfigStruct = {
      owner: dave.address,
      inputToken: tokenB.address,
      inputVaultId: daveInputVault,
      outputToken: tokenA.address,
      outputVaultId: daveOutputVault,
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
      vmState: {
        stackIndex: 0,
        stack: [0, 0, 0, 0, 0, 0, 0, 0],
        sources: [daveSource],
        constants: daveConstants,
        arguments: [],
      },
    };

    const txDaveOrderLive = await orderBook
      .connect(dave)
      .addOrder(daveOrderConfig);

    const { config: daveConfig } = (await Util.getEventArgs(
      txDaveOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    // DEPOSITS - CAROL & DAVE

    await tokenB.transfer(carol.address, amountB);
    await tokenA.transfer(dave.address, amountA);

    const depositConfigStructCarol: DepositConfigStruct = {
      depositor: carol.address,
      token: tokenB.address,
      vaultId: carolOutputVault,
      amount: amountB,
    };
    const depositConfigStructDave: DepositConfigStruct = {
      depositor: dave.address,
      token: tokenA.address,
      vaultId: daveOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(carol)
      .approve(orderBook.address, depositConfigStructCarol.amount);
    await tokenA
      .connect(dave)
      .approve(orderBook.address, depositConfigStructDave.amount);

    // Carol deposits tokenB into her output vault
    await orderBook.connect(carol).deposit(depositConfigStructCarol);
    // Dave deposits tokenA into his output vault
    await orderBook.connect(dave).deposit(depositConfigStructDave);

    // BOUNTY BOT CLEARS THE ORDER - CAROL & DAVE

    const bountyConfig1: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(carolConfig, daveConfig, bountyConfig1);
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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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
