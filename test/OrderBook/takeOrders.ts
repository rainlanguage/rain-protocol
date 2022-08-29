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
  DepositEvent,
  OrderBook,
  OrderConfigStruct,
  OrderLiveEvent,
} from "../../typechain/OrderBook";
import { OrderBookIntegrity } from "../../typechain/OrderBookIntegrity";
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
import { op, memoryOperand, MemoryType } from "../../utils/rainvm/vm";
import { assertError } from "../../utils/test/assertError";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

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
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);

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
  });
});
