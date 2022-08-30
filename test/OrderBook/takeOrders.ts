import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  OrderBookIntegrity,
  ReserveToken18,
} from "../../typechain";
import {
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  OrderLiveEvent,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { eighteenZeros, max_uint256 } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { getEventArgs } from "../../utils/events";
import { OrderBookOpcode } from "../../utils/rainvm/ops/orderBookOps";
import { memoryOperand, MemoryType, op } from "../../utils/rainvm/vm";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = OrderBookOpcode;

describe("OrderBook take orders", async function () {
  let orderBookFactory: ContractFactory,
    tokenA: ReserveToken18,
    tokenB: ReserveToken18,
    integrity: OrderBookIntegrity;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "OrderBookIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as OrderBookIntegrity;
    await integrity.deployed();

    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should take order (clear an order directly from buyer wallet)", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy(
      integrity.address
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askPrice];
    const vAskOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
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

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice.address, amountB);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);

    // Bob takes order with direct wallet transfer
    const takeOrderConfigStruct0: TakeOrderConfigStruct = {
      order: askConfig,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenB.address,
      input: tokenA.address,
      minimumInput: 0,
      maximumInput: max_uint256,
      maximumIORatio: max_uint256,
      orders: [takeOrderConfigStruct0],
    };

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct0);

    const { sender, takeOrder, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    console.log({ sender, takeOrder, input, output });
  });
});
