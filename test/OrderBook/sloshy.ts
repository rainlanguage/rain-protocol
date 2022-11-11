import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  ERC3156FlashBorrowerTest,
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  AddOrderEvent,
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  OrderConfigStruct,
  DepositEvent,
  TakeOrderConfigStruct,
  TakeOrdersConfigStruct,
  TakeOrderEvent,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  ONE,
  sixteenZeros,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { fixedPointDiv, fixedPointMul, minBN } from "../../utils/math";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("OrderBook sloshy test", async function () {
  let orderBookFactory: ContractFactory;
  let USDT: ReserveToken18;
  let DAI: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  beforeEach(async () => {
    USDT = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    DAI = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await USDT.initialize();
    await DAI.initialize();
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployer(interpreter);
  });

  it("should complete an e2e slosh without a loan", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const uni = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const vaultAlice = ethers.BigNumber.from(randomUint256());
    const vaultBountyBot = ethers.BigNumber.from(randomUint256());

    const threshold = ethers.BigNumber.from(101 + sixteenZeros); // 1%

    const constants = [max_uint256, threshold];

    const vMaxAmount = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vThreshold = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source = concat([
      vMaxAmount,
      vThreshold,
    ]);

    ////////////////// 1. alice's order says she will give anyone 1 DAI who can give her 1.01 USDT
    const orderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: USDT.address, vaultId: vaultAlice }],
      validOutputs: [{ token: DAI.address, vaultId: vaultAlice }],
      interpreterStateConfig: {
        sources: [source],
        constants: constants,
      },
    };

    const txAskAddOrder = await orderBook.connect(alice).addOrder(orderConfig);

    const { sender: askSender, order: askConfig } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    compareStructs(askConfig, orderConfig);

    ////////////////// 1.1 Alice deposits DAI into her output vault
    const amountDAI = ethers.BigNumber.from("1" + eighteenZeros);
    await DAI.transfer(alice.address, amountDAI);
    const depositConfigStructAlice: DepositConfigStruct = {
      token: DAI.address,
      vaultId: vaultAlice,
      amount: amountDAI,
    };
    await DAI.connect(alice).approve(
      orderBook.address,
      depositConfigStructAlice.amount
    );

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

    ////////////////// 2. consider the setup where bob simply has 1 DAI already
    await DAI.transfer(bob.address, amountDAI);

    ////////////////// 3. bob sells his 1 DAI to uni for 1.02 USDT [ assuming this happens externally ]
    const amountUniUSDT = ethers.BigNumber.from(102 + sixteenZeros); // 2%
    await USDT.transfer(uni.address, amountUniUSDT);

    // 3.1 bob transfering 1 DAI to uni
    await DAI.connect(bob).approve(uni.address, amountDAI);
    await DAI.connect(bob).transfer(uni.address, amountDAI);
    // 3.2 bob receiving 1.02 USDT from uni
    await USDT.connect(uni).approve(bob.address, amountUniUSDT);
    await USDT.connect(uni).transfer(bob.address, amountUniUSDT);

    ////////////////// 4. bob takes alice's order [bob sells his 1.01 USDT to alice for 1 DAI]
    const takeOrderConfigStruct: TakeOrderConfigStruct = {
      order: askConfig,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: USDT.address,
      input: DAI.address,
      minimumInput: amountDAI,
      maximumInput: amountDAI,
      maximumIORatio: threshold,
      orders: [takeOrderConfigStruct],
    };

    await USDT.connect(bob).approve(orderBook.address, threshold);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const { sender, takeOrder, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(amountDAI), "wrong input");
    assert(output.eq(threshold), "wrong output");
    compareStructs(takeOrder, takeOrderConfigStruct);

    ////////////////// 4. bob now has 1 DAI and 0.01 USDT
    const bobUSDTBalance = await USDT.balanceOf(bob.address);
    const bobDAIBalance = await DAI.balanceOf(bob.address);
    const expectedBalance = amountUniUSDT.sub(threshold);
    assert(bobUSDTBalance.eq(expectedBalance), "wrong USDT balance");
    assert(bobDAIBalance.eq(amountDAI), "wrong DAI balance");

    ////////////////// 5. alice now has 0 DAI and 1.01 USDT
    await orderBook.connect(alice).withdraw({
      token: USDT.address,
      vaultId: vaultAlice,
      amount: threshold,
    });
    const aliceUSDTBalance = await USDT.balanceOf(alice.address);
    const aliceDAIBalance = await DAI.balanceOf(alice.address);
    assert(aliceUSDTBalance.eq(threshold), "wrong USDT balance");
    assert(aliceDAIBalance.eq(0), "wrong DAI balance");
  });
});
