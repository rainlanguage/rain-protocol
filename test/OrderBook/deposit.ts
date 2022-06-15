import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type {
  DepositConfigStruct,
  DepositEvent,
  OrderBook,
} from "../../typechain/OrderBook";
import { OrderBookStateBuilder } from "../../typechain/OrderBookStateBuilder";
import { ReserveToken18 } from "../../typechain/ReserveToken18";
import { eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";

describe("OrderBook vault deposit", async function () {
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

  it("should allow deposits", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook;

    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobOutputVault = ethers.BigNumber.from(2);

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);

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

    assert(depositAliceSender === alice.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    compareStructs(depositBobConfig, depositConfigStructBob);
  });
});
