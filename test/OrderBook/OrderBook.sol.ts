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

  it("should expose tracked data to RainVM calculations (e.g. ask order will trigger revert if bid order does not clear output vault funds)", async function () {
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

    const askOutputMax = Util.max_uint256;
    const askPriceIfClearFunds = ethers.BigNumber.from(
      "90" + Util.eighteenZeros
    );
    const askPriceIfNotClearFunds = Util.max_uint256;

    const askConstants = [
      askOutputMax,
      askPriceIfClearFunds,
      askPriceIfNotClearFunds,
    ];
    const vAskOutputMax = op(Opcode.VAL, 0);
    const vAskPriceIfClear = op(Opcode.VAL, 1);
    const vAskPriceIfNotClear = op(Opcode.VAL, 2);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
        op(Opcode.ORDER_FUNDS_CLEARED),
        vAskPriceIfClear,
        vAskPriceIfNotClear,
      op(Opcode.EAGER_IF)
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
        stack: [0, 0, 0, 0, 0, 0, 0, 0],
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
    const bidPrice = Util.fixedPointDiv(Util.ONE, askPriceIfClearFunds);

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

    // TODO: Test fail case
    // BOUNTY BOT CLEARS THE ORDER

    const bountyConfig: BountyConfigStruct = {
      aVaultId: bountyBotVaultA,
      bVaultId: bountyBotVaultB,
    };

    await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, bountyConfig);
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

    const askPriceIfMatchingCounterparty = ethers.BigNumber.from(
      "90" + Util.eighteenZeros
    );
    const askPriceIfNotMatchingCounterparty = Util.max_uint256;

    const askConstants = [
      Util.max_uint256,
      askPriceIfMatchingCounterparty,
      askPriceIfNotMatchingCounterparty,
      carol.address,
    ];
    const vAskOutputMax = op(Opcode.VAL, 0);
    const vAskPriceIfMatch = op(Opcode.VAL, 1);
    const vAskPriceIfNotMatch = op(Opcode.VAL, 2);
    const vExpectedCounterparty = op(Opcode.VAL, 3);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
          op(Opcode.COUNTERPARTY),
          vExpectedCounterparty,
        op(Opcode.EQUAL_TO),
        vAskPriceIfMatch,
        vAskPriceIfNotMatch,
      op(Opcode.EAGER_IF)
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
        stack: [0, 0, 0, 0, 0, 0, 0, 0],
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

    const bidPrice = Util.fixedPointDiv(
      Util.ONE,
      askPriceIfMatchingCounterparty
    );
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

    // BID ORDER - GOOD MATCH

    const bidPriceCarol = Util.fixedPointDiv(
      Util.ONE,
      askPriceIfMatchingCounterparty
    );
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
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
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
      "reverted with panic code 0x11",
      "should underflow due to maxed ask price since bob does not match expected counterparty"
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
      Util.fixedPointMul(askPriceIfMatchingCounterparty, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: Util.fixedPointMul(
        askPriceIfMatchingCounterparty,
        aOutputExpected
      ),
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
