import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  AddOrderEvent,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  OrderExceedsMaxRatioEvent,
  OrderNotFoundEvent,
  OrderZeroAmountEvent,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { AllStandardOps, assertError, randomUint256 } from "../../utils";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs, getEvents } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("OrderBook take orders", async function () {
  let orderBookFactory: ContractFactory;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployer(interpreter);
  });

  it("should respect output maximum of a given order", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDERS

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const askOrderOutputMax = amountB.sub(1); // will only sell 999 tokenBs to each buyer
    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [askOrderOutputMax, askPrice];
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

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };
    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askConfigAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askConfigBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: bobOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
    await tokenB.transfer(bob.address, amountB);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenB
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenB into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // TAKE ORDER

    // Carol takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: askConfigAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askConfigBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct),
      "MIN_INPUT",
      "did not respect order output max"
    );
  });

  it("should validate minimum input", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDERS

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

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };
    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askConfigAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askConfigBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: bobOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
    await tokenB.transfer(bob.address, amountB);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenB
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenB into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // TAKE ORDER

    // Carol takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: askConfigAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askConfigBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // min > max should ALWAYS fail
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // gt total vault deposits
      maximumInput: amountB.mul(2).add(1),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct2: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice.sub(1), // lt actual ratio
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct0),
      "MIN_INPUT",
      "did not validate minimum input gt maximum input"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct1),
      "MIN_INPUT",
      "did not validate minimum input gt total deposits"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct2),
      "MIN_INPUT",
      "did not validate maximumIORatio"
    );
  });

  it("should validate input/output tokens", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDERS

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

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };
    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askConfigAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askConfigBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: bobOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
    await tokenB.transfer(bob.address, amountB);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenB
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenB into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // TAKE ORDER

    // Carol takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: askConfigAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askConfigBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenB.address, // will result in mismatch
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenA.address, // will result in mismatch
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct0),
      "TOKEN_MISMATCH",
      "did not validate output token"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct1),
      "TOKEN_MISMATCH",
      "did not validate input token"
    );
  });

  it("should emit event when an order has zero output max amount", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDER 0

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants0 = [0, askPrice];
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
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants0,
      },
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askConfig0 } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // ASK ORDER 1

    const askConstants1 = [max_uint256, askPrice];
    const askOrderConfig1: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants1,
      },
    };

    const txAskAddOrder1 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig1);

    const { order: askConfig1 } = (await getEventArgs(
      txAskAddOrder1,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
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

    const takeOrderConfigStruct0: TakeOrderConfigStruct = {
      order: askConfig0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: askConfig1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.connect(bob).approve(orderBook.address, amountA);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const ordersExpired = (await getEvents(
      txTakeOrders,
      "OrderZeroAmount",
      orderBook
    )) as OrderZeroAmountEvent["args"][];

    assert(ordersExpired.length === 1);
    assert(ordersExpired[0].sender === bob.address);
    assert(ordersExpired[0].owner === alice.address);
    assert(ordersExpired[0].orderHash); // not sure how to verify order hash from config, solidityKeccak256 has rejected all types I've thrown at it
  });

  it("should emit event when an order exceeds max IO ratio", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDER 0

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants0 = [max_uint256, askPrice.add(1)]; // does exceed max ratio
    const askConstants1 = [max_uint256, askPrice]; // doesn't exceed max IO ratio
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
    const askOrderConfig0: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants0,
      },
    };
    const askOrderConfig1: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants1,
      },
    };

    const txAskAddOrder0 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig0);
    const txAskAddOrder1 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig1);

    const { order: askConfig0 } = (await getEventArgs(
      txAskAddOrder0,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askConfig1 } = (await getEventArgs(
      txAskAddOrder1,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
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

    const takeOrderConfigStruct0: TakeOrderConfigStruct = {
      order: askConfig0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: askConfig1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.connect(bob).approve(orderBook.address, amountA);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const ordersExceedsMaxRatio = (await getEvents(
      txTakeOrders,
      "OrderExceedsMaxRatio",
      orderBook
    )) as OrderExceedsMaxRatioEvent["args"][];

    assert(ordersExceedsMaxRatio.length === 1);
    assert(ordersExceedsMaxRatio[0].sender === bob.address);
    assert(ordersExceedsMaxRatio[0].owner === alice.address);
    assert(ordersExceedsMaxRatio[0].orderHash); // not sure how to verify order hash from config, solidityKeccak256 has rejected all types I've thrown at it
  });

  it("should emit event when an order wasn't found", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

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
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askConfig } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
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

    // TAKE BAD ORDER

    const takeOrderConfigStructGood: TakeOrderConfigStruct = {
      order: askConfig,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBad: TakeOrderConfigStruct = {
      order: { ...askConfig, owner: bob.address }, // order hash won't match any added orders
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructBad, takeOrderConfigStructGood], // test bad order before good order (when remaining input is non-zero)
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.connect(bob).approve(orderBook.address, amountA);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const ordersNotFound = (await getEvents(
      txTakeOrders,
      "OrderNotFound",
      orderBook
    )) as OrderNotFoundEvent["args"][];

    assert(ordersNotFound.length === 1);
    assert(ordersNotFound[0].sender === bob.address);
    assert(ordersNotFound[0].owner === bob.address);
    assert(ordersNotFound[0].orderHash);
  });

  it("should take multiple orders on the good path (clear multiple orders directly from buyer wallet)", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDERS

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

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };
    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askConfigAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askConfigBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: bobOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
    await tokenB.transfer(bob.address, amountB);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenB
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenB into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // TAKE ORDER

    // Carol takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: askConfigAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askConfigBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    const txTakeOrders = await orderBook
      .connect(carol)
      .takeOrders(takeOrdersConfigStruct);

    const events = (await getEvents(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"][];

    assert(
      events.length === 2,
      `wrong number of TakeOrder events
      expected  2
      got       ${events.length}`
    );

    const [takeOrderAlice, takeOrderBob] = events;

    assert(takeOrderAlice.sender === carol.address, "wrong sender");
    assert(takeOrderAlice.input.eq(amountB), "wrong input");
    assert(takeOrderAlice.output.eq(amountA), "wrong output");
    compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

    assert(takeOrderBob.sender === carol.address, "wrong sender");
    assert(takeOrderBob.input.eq(amountB), "wrong input");
    assert(takeOrderBob.output.eq(amountA), "wrong output");
    compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

    const tokenAAliceBalance = await tokenA.balanceOf(alice.address);
    const tokenBAliceBalance = await tokenB.balanceOf(alice.address);
    const tokenABobBalance = await tokenA.balanceOf(bob.address);
    const tokenBBobBalance = await tokenB.balanceOf(bob.address);
    const tokenACarolBalance = await tokenA.balanceOf(carol.address);
    const tokenBCarolBalance = await tokenB.balanceOf(carol.address);

    assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
    assert(tokenBAliceBalance.isZero());
    assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
    assert(tokenBBobBalance.isZero());
    assert(tokenACarolBalance.isZero());
    assert(tokenBCarolBalance.eq(amountB.mul(2)));

    await orderBook.connect(alice).withdraw({
      token: tokenA.address,
      vaultId: aliceInputVault,
      amount: amountA,
    });
    await orderBook.connect(bob).withdraw({
      token: tokenA.address,
      vaultId: bobInputVault,
      amount: amountA,
    });

    const tokenAAliceBalanceWithdrawn = await tokenA.balanceOf(alice.address);
    const tokenABobBalanceWithdrawn = await tokenA.balanceOf(bob.address);
    assert(tokenAAliceBalanceWithdrawn.eq(amountA));
    assert(tokenABobBalanceWithdrawn.eq(amountA));
  });

  it("should take order on the good path (clear an order directly from buyer wallet)", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

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
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenA.address, vaultId: aliceInputVault }],
      validOutputs: [{ token: tokenB.address, vaultId: aliceOutputVault }],
      interpreterStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askConfig } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenB.transfer(alice.address, amountB);
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

    // TAKE ORDER

    // Bob takes order with direct wallet transfer
    const takeOrderConfigStruct: TakeOrderConfigStruct = {
      order: askConfig,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askPrice,
      orders: [takeOrderConfigStruct],
    };

    const amountA = amountB.mul(askPrice).div(ONE);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.connect(bob).approve(orderBook.address, amountA);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const { sender, takeOrder, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(amountB), "wrong input");
    assert(output.eq(amountA), "wrong output");

    compareStructs(takeOrder, takeOrderConfigStruct);

    const tokenAAliceBalance = await tokenA.balanceOf(alice.address);
    const tokenBAliceBalance = await tokenB.balanceOf(alice.address);
    const tokenABobBalance = await tokenA.balanceOf(bob.address);
    const tokenBBobBalance = await tokenB.balanceOf(bob.address);

    assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
    assert(tokenBAliceBalance.isZero());
    assert(tokenABobBalance.isZero());
    assert(tokenBBobBalance.eq(amountB));

    await orderBook.connect(alice).withdraw({
      token: tokenA.address,
      vaultId: aliceInputVault,
      amount: amountA,
    });

    const tokenAAliceBalanceWithdrawn = await tokenA.balanceOf(alice.address);
    assert(tokenAAliceBalanceWithdrawn.eq(amountA));
  });
});
