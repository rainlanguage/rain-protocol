import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import type {
  BountyConfigStruct,
  ClearEvent,
  DepositConfigStruct,
  DepositEvent,
  OrderBook,
  OrderConfigStruct,
  OrderLiveEvent,
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

describe.only("OrderBook", async function () {
  beforeEach(async () => {
    tokenA = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
    tokenB = (await Util.basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
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

    // const askPrice = ethers.BigNumber.from("90" + Util.eighteenZeros);
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

    // const bidPrice = ethers.BigNumber.from(
    //   ethers.FixedNumber.from(1, "ufixed256x18").divUnsafe(
    //     ethers.FixedNumber.from(89, "ufixed256x18")
    //   )
    // );
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

    console.log({
      clearSender,
      clearA_,
      clearB_,
      clearBountyConfig,
      clearStateChange,
    });

    assert(clearSender === bountyBot.address);
    Util.compareSolStructs(clearA_, askConfig);
    Util.compareSolStructs(clearB_, bidConfig);
    Util.compareStructs(clearBountyConfig, bountyConfig);
    assert(clearStateChange);
  });
});
