import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import type {
  BountyConfigStruct,
  ClearEvent,
  OrderBook,
  OrderConfigStruct,
  OrderLiveEvent,
} from "../../typechain/OrderBook";
import { ReserveToken } from "../../typechain/ReserveToken";
import { Opcode } from "./OrderBookUtil";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";

const { assert } = chai;

const TRACK_CLEARED_ORDER = 0x1;
const TRACK_CLEARED_COUNTERPARTY = 0x2;

let orderBookFactory: ContractFactory,
  tokenA: ReserveToken & Contract,
  tokenB: ReserveToken & Contract;

describe("OrderBook", async function () {
  beforeEach(async () => {
    tokenA = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
    tokenB = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
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

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + Util.sixZeros);
    const askConstants = [askPrice, Util.max_uint256];
    const vAskPrice = op(Opcode.VAL, 0);
    const vAskOutputMax = op(Opcode.VAL, 1);
    // prettier-ignore
    const askSource = concat([
      vAskPrice,
      vAskOutputMax
    ]);
    const askOrderConfig: OrderConfigStruct = {
      owner: alice.address,
      inputToken: tokenA.address,
      inputVaultId: ethers.BigNumber.from(1),
      outputToken: tokenB.address,
      outputVaultId: ethers.BigNumber.from(2),
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
      vmState: {
        stackIndex: 0,
        stack: [],
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

    const bidPrice = ethers.BigNumber.from("90" + Util.sixZeros);
    const bidConstants = [bidPrice, Util.max_uint256];
    const vBidPrice = op(Opcode.VAL, 0);
    const vBidOutputMax = op(Opcode.VAL, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidPrice,
      vBidOutputMax
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      owner: bob.address,
      inputToken: tokenB.address,
      inputVaultId: ethers.BigNumber.from(3),
      outputToken: tokenA.address,
      outputVaultId: ethers.BigNumber.from(4),
      tracking: TRACK_CLEARED_ORDER | TRACK_CLEARED_COUNTERPARTY,
      vmState: {
        stackIndex: 0,
        stack: [],
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

    // BOUNTY BOT CLEARS THE ORDER

    const bountyConfig: BountyConfigStruct = {
      aVaultId: ethers.BigNumber.from(5),
      bVaultId: ethers.BigNumber.from(6),
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
    Util.compareSolStructs(clearA_, askConfig); // util fn may not work
    Util.compareSolStructs(clearB_, bidConfig); // util fn may not work
    Util.compareStructs(clearBountyConfig, bountyConfig);
    assert(clearStateChange);
  });
});
