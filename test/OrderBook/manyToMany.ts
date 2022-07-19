import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  OrderBook,
  OrderConfigStruct,
  OrderLiveEvent,
} from "../../typechain/OrderBook";
import { OrderBookStateBuilder } from "../../typechain/OrderBookStateBuilder";
import { ReserveToken18 } from "../../typechain/ReserveToken18";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { getEventArgs } from "../../utils/events";
import { fixedPointDiv, fixedPointMul, minBN } from "../../utils/math";
import { OrderBookOpcode } from "../../utils/rainvm/ops/orderBookOps";
import { op } from "../../utils/rainvm/vm";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

const Opcode = OrderBookOpcode;

describe("OrderBook many-to-many", async function () {
  let orderBookFactory: ContractFactory,
    tokenA: ReserveToken18,
    tokenB: ReserveToken18,
    tokenC: ReserveToken18,
    tokenD: ReserveToken18,
    stateBuilder: OrderBookStateBuilder;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenC = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenD = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
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

  it("should add many ask and bid orders and clear the orders", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, vaultId: aliceInputVault },
        { token: tokenC.address, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, vaultId: aliceOutputVault },
        { token: tokenD.address, vaultId: aliceOutputVault },
      ],
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

    // BID ORDER

    const bidPrice = fixedPointDiv(ONE, askPrice);
    const bidConstants = [max_uint256, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenB.address, vaultId: bobOutputVault },
        { token: tokenD.address, vaultId: bobOutputVault },
      ],
      validOutputs: [
        { token: tokenA.address, vaultId: bobInputVault },
        { token: tokenC.address, vaultId: bobInputVault },
      ],
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bidConfig, bidOrderConfig);

    // DEPOSITS

    const amount = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenA.transfer(bob.address, amount);
    await tokenB.transfer(alice.address, amount);
    await tokenC.transfer(bob.address, amount);
    await tokenD.transfer(alice.address, amount);

    const depositConfigStructBobA: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: bobInputVault,
      amount,
    };
    const depositConfigStructAliceB: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount,
    };
    const depositConfigStructBobC: DepositConfigStruct = {
      token: tokenC.address,
      vaultId: bobInputVault,
      amount,
    };
    const depositConfigStructAliceD: DepositConfigStruct = {
      token: tokenD.address,
      vaultId: aliceOutputVault,
      amount,
    };

    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBobA.amount);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceB.amount);
    await tokenC
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBobC.amount);
    await tokenD
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceD.amount);

    // Alice deposits tokens into her output vault
    const _txDepositOrderAliceB = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAliceB);
    const _txDepositOrderAliceD = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAliceD);

    // Bob deposits tokens into his output vault
    const _txDepositOrderBobA = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBobA);
    const _txDepositOrderBobC = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBobC);

    // BOUNTY BOT CLEARS THE ORDERS

    const clearConfig0: ClearConfigStruct = {
      aInputIndex: 0,
      aOutputIndex: 0,
      bInputIndex: 0,
      bOutputIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, clearConfig0);

    const {
      sender: clearSender0,
      a_: clearA_,
      b_: clearB_,
      clearConfig: clearBountyConfig0,
    } = (await getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: clearStateChange0 } = (await getEventArgs(
      txClearOrder0,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected0 = amount;
    const bOutputMaxExpected0 = amount;

    const aOutputExpected0 = minBN(
      aOutputMaxExpected0,
      fixedPointMul(bidPrice, amount)
    );
    const bOutputExpected0 = minBN(
      bOutputMaxExpected0,
      fixedPointMul(askPrice, amount)
    );

    const expectedClearStateChange0: ClearStateChangeStruct = {
      aOutput: aOutputExpected0,
      bOutput: bOutputExpected0,
      aInput: fixedPointMul(askPrice, aOutputExpected0),
      bInput: fixedPointMul(bidPrice, bOutputExpected0),
    };

    assert(clearSender0 === bountyBot.address);
    compareSolStructs(clearA_, askConfig);
    compareSolStructs(clearB_, bidConfig);
    compareStructs(clearBountyConfig0, clearConfig0);
    compareStructs(clearStateChange0, expectedClearStateChange0);

    const clearConfig1: ClearConfigStruct = {
      aInputIndex: 1,
      aOutputIndex: 1,
      bInputIndex: 1,
      bOutputIndex: 1,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfig, clearConfig1);

    const {
      sender: clearSender1,
      a_: clearC_,
      b_: clearD_,
      clearConfig: clearBountyConfig1,
    } = (await getEventArgs(
      txClearOrder1,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: clearStateChange1 } = (await getEventArgs(
      txClearOrder1,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const cOutputMaxExpected1 = amount;
    const dOutputMaxExpected1 = amount;

    const cOutputExpected1 = minBN(
      cOutputMaxExpected1,
      fixedPointMul(bidPrice, amount)
    );
    const dOutputExpected1 = minBN(
      dOutputMaxExpected1,
      fixedPointMul(askPrice, amount)
    );

    const expectedClearStateChange1: ClearStateChangeStruct = {
      aOutput: cOutputExpected1,
      bOutput: dOutputExpected1,
      aInput: fixedPointMul(askPrice, cOutputExpected1),
      bInput: fixedPointMul(bidPrice, dOutputExpected1),
    };

    assert(clearSender1 === bountyBot.address);
    compareSolStructs(clearC_, askConfig);
    compareSolStructs(clearD_, bidConfig);
    compareStructs(clearBountyConfig1, clearConfig1);
    compareStructs(clearStateChange1, expectedClearStateChange1);
  });

  it("should add many-to-many orders", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook;

    const aliceVaultA = ethers.BigNumber.from(1);
    const aliceVaultB = ethers.BigNumber.from(2);
    const bobVaultB = ethers.BigNumber.from(1);
    const bobVaultA = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, vaultId: aliceVaultA },
        { token: tokenB.address, vaultId: aliceVaultB },
      ],
      validOutputs: [
        { token: tokenB.address, vaultId: aliceVaultB },
        { token: tokenA.address, vaultId: aliceVaultA },
      ],
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

    // BID ORDER

    const bidPrice = fixedPointDiv(ONE, askPrice);
    const bidConstants = [max_uint256, bidPrice];
    const vBidOutputMax = op(Opcode.CONSTANT, 0);
    const vBidPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenB.address, vaultId: bobVaultB },
        { token: tokenA.address, vaultId: bobVaultA },
      ],
      validOutputs: [
        { token: tokenA.address, vaultId: bobVaultA },
        { token: tokenB.address, vaultId: bobVaultB },
      ],
      vmStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, config: bidConfig } = (await getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bidConfig, bidOrderConfig);
  });
});
