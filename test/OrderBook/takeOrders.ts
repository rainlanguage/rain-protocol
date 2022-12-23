import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
  ReserveTokenDecimals,
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
import {
  AllStandardOps,
  assertError,
  fixedPointMul,
  randomUint256,
} from "../../utils";
import {
  eighteenZeros,
  max_uint256,
  ONE,
  sixteenZeros,
  sixZeros,
  tenZeros,
  twentyZeros,
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

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const askOrderOutputMax = amountB.sub(1); // will only sell 999 tokenBs to each buyer
    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [askOrderOutputMax, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")


    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder")

    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : bobBidOrder
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askOrderBob } = (await getEventArgs(
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
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };     

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder")

    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : bobBidOrder
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askOrderBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // min > max should ALWAYS fail
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // gt total vault deposits
      maximumInput: amountB.mul(2).add(1),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct2: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio.sub(1), // lt actual ratio
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

  it("should autoscale expression ratio based on input/output token decimals", async function () {
    const signers = await ethers.getSigners();

    // e.g. tether
    const XDec = 6;
    // e.g. dai
    const YDec = 18;

    const tokenX = (await basicDeploy("ReserveTokenDecimals", {}, [
      XDec,
    ])) as ReserveTokenDecimals;
    const tokenY = (await basicDeploy("ReserveTokenDecimals", {}, [
      YDec,
    ])) as ReserveTokenDecimals;
    await tokenX.initialize();
    await tokenY.initialize();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const vaultId = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio = ethers.BigNumber.from("10").pow(18);
    const constants = [max_uint256, ratio];
    const vInfinity = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const source = concat([
      vInfinity,
      vRatio,
    ]);

    const orderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenX.address, decimals: XDec, vaultId },
        { token: tokenY.address, decimals: YDec, vaultId },
      ],
      validOutputs: [
        { token: tokenX.address, decimals: XDec, vaultId },
        { token: tokenY.address, decimals: YDec, vaultId },
      ],
      interpreterStateConfig: {
        sources: [source, []],
        constants,
      },
      data: []
    };

    const txAddOrder = await orderBook.connect(alice).addOrder(orderConfig);

    const { order } = (await getEventArgs(
      txAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const depositX: DepositConfigStruct = {
      token: tokenX.address,
      vaultId,
      amount: 1,
    };

    await tokenX.transfer(alice.address, 1);
    await tokenX.connect(alice).approve(orderBook.address, 1);
    await orderBook.connect(alice).deposit(depositX);

    // TAKE ORDER

    // For the math below to work without loss of precision we need Y decimals
    // to be larger than X decimals because we've only deposited 1 of X.
    assert(YDec >= XDec);
    const takeOrdersConfig: TakeOrdersConfigStruct = {
      output: tokenY.address,
      input: tokenX.address,
      minimumInput: 1,
      maximumInput: 1,
      // maximum IO ratio is from order's perspective.
      // 1e18 = 1:1
      maximumIORatio: ethers.BigNumber.from("10").pow(18 + YDec - XDec),
      // inputs and outputs are inverse from order's perspective
      orders: [{ order, inputIOIndex: 1, outputIOIndex: 0 }],
    };

    const amountY = ethers.BigNumber.from("10").pow(YDec - XDec);
    await tokenY.transfer(bob.address, amountY);

    const bobBeforeX = await tokenX.balanceOf(bob.address);
    const bobBeforeY = await tokenY.balanceOf(bob.address);

    assert(
      bobBeforeX.eq(0),
      `wrong X balance before expected 0 got ${bobBeforeX}`
    );
    assert(
      bobBeforeY.eq(amountY),
      `wrong Y balance after expected ${amountY} got ${bobBeforeY}`
    );

    await tokenY.connect(bob).approve(orderBook.address, amountY);
    await orderBook.connect(bob).takeOrders(takeOrdersConfig);

    const bobAfterX = await tokenX.balanceOf(bob.address);
    const bobAfterY = await tokenY.balanceOf(bob.address);

    assert(
      bobAfterX.eq(1),
      `wrong X balance after expected 1 got ${bobAfterX}`
    );
    assert(
      bobAfterY.eq(0),
      `wrong Y balance after expected 0 got ${bobAfterY}`
    );

    // INVERSE

    const inverseTakeOrdersConfig: TakeOrdersConfigStruct = {
      output: tokenX.address,
      input: tokenY.address,
      minimumInput: amountY,
      maximumInput: amountY,
      maximumIORatio: ethers.BigNumber.from("10").pow(18 + XDec - YDec),
      orders: [{ order, inputIOIndex: 0, outputIOIndex: 1 }],
    };

    await tokenX.connect(bob).approve(orderBook.address, 1);
    await orderBook.connect(bob).takeOrders(inverseTakeOrdersConfig);

    const bobInverseX = await tokenX.balanceOf(bob.address);
    const bobInverseY = await tokenY.balanceOf(bob.address);

    assert(
      bobInverseX.eq(bobBeforeX),
      `wrong inverse X balance expected ${bobBeforeX} got ${bobInverseX}`
    );
    assert(
      bobInverseY.eq(bobBeforeY),
      `wrong inverse Y balance expected ${bobBeforeY} got ${bobInverseY}`
    );
  });

  describe("should scale outputMax with decimals", () => {
    it("should scale outputMax based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB06.decimals();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB06.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA06.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB06.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA06.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB06.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB06.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 20;
      const tokenBDecimals = 6;

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA20.address,
        input: tokenB06.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA20.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA20
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA20.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA20.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA20.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA20.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA20.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB06.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA20.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA20.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB06.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA20.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA20.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB06.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 18 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 18;
      const tokenBDecimals = 6;

      const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA18.initialize();
      await tokenB06.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA18.address,
        input: tokenB06.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA18.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA18
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA18.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA18.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA18.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA18.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA18.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB06.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA18.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA18.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB06.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA18.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA18.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB06.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 20;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + twentyZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB20.transfer(alice.address, depositAmountB);
      await tokenB20.transfer(bob.address, depositAmountB);
      await tokenB20.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB20.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB20.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB20.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB20.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB20.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA06.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB20.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA06.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB20.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB20.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB20.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB20.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 18;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenB18.transfer(bob.address, depositAmountB);
      await tokenB18.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB18.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB18.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB18.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB18.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB18.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA06.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB18.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA06.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB18.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB18.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB18.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 0;
      const tokenBDecimals = 18;

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenB18.transfer(bob.address, depositAmountB);
      await tokenB18.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB18.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA00.address,
        input: tokenB18.address,
        minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
        maximumInput: depositAmountB,
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA00.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA00
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(
        takeOrderAlice.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderAlice.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(
        takeOrderBob.input.eq(depositAmountB.div(2)),
        "wrong input, output max wasn't respected"
      );
      assert(
        takeOrderBob.output.eq(depositAmountA.div(2)),
        "wrong output, output max wasn't respected"
      );
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA00.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB18.balanceOf(alice.address);
      const tokenABobBalance = await tokenA00.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB18.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA00.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB18.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenACarolBalance.eq(depositAmountA)); // this is what is leftover since not all of Carol's approved tokenA could be used when taking orders with max output of 1, without output limit this would be depositAmountA.mul(2)
      assert(tokenBCarolBalance.eq(depositAmountB)); // similarly, this is only what Carol could get from Alice and Bob's orders, without output limit this would be depositAmountB.mul(2)

      await orderBook.connect(alice).withdraw({
        token: tokenA00.address,
        vaultId: aliceInputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenA00.address,
          aliceInputVault
        ),
      });
      await orderBook.connect(alice).withdraw({
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: await orderBook.vaultBalance(
          alice.address,
          tokenB18.address,
          aliceOutputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA00.address,
        vaultId: bobInputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenA00.address,
          bobInputVault
        ),
      });
      await orderBook.connect(bob).withdraw({
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: await orderBook.vaultBalance(
          bob.address,
          tokenB18.address,
          bobOutputVault
        ),
      });

      const tokenAAliceBalanceWithdrawn = await tokenA00.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA00.balanceOf(bob.address);
      const tokenBAliceBalanceWithdrawn = await tokenB18.balanceOf(
        alice.address
      );
      const tokenBBobBalanceWithdrawn = await tokenB18.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA.div(2)));
      assert(tokenBAliceBalanceWithdrawn.eq(depositAmountB.div(2)));
      assert(tokenBBobBalanceWithdrawn.eq(depositAmountB.div(2)));
    });
  });

  describe("should scale ratio with decimals", () => {
    it("should scale ratio based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 6;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB06.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 20;
      const tokenBDecimals = 6;

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA20.address,
        input: tokenB06.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA20.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA20
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA20.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA20.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA20.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA20.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA20.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA20.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA20.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 18 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 18;
      const tokenBDecimals = 6;

      const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA18.initialize();
      await tokenB06.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenB06.transfer(bob.address, depositAmountB);
      await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB06.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA18.address,
        input: tokenB06.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA18.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA18
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA18.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA18.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA18.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA18.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA18.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA18.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA18.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 20;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + twentyZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB20.transfer(alice.address, depositAmountB);
      await tokenB20.transfer(bob.address, depositAmountB);
      await tokenB20.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB20.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB20.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB20.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB20.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB20.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 18;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenB18.transfer(bob.address, depositAmountB);
      await tokenB18.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB18.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA06.address,
        input: tokenB18.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA06.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA06
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB18.balanceOf(alice.address);
      const tokenABobBalance = await tokenA06.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB18.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA06.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB18.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA06.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA06.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA06.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 0;
      const tokenBDecimals = 18;

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

      const alice = signers[1];
      const bob = signers[2];
      const carol = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ASK ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);

      const askConstants = [max_uint256, askRatio];
      const vAskOutputMax = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 0)
      );
      const vAskRatio = op(
        Opcode.READ_MEMORY,
        memoryOperand(MemoryType.Constant, 1)
      );
      // prettier-ignore
      const askSource = concat([
        vAskOutputMax,
        vAskRatio,
      ]);

      const askOrderConfigAlice: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };
      const askOrderConfigBob: OrderConfigStruct = {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
        validInputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
        data: []
      };

      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfigAlice);
      const txAskAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(askOrderConfigBob);

      const { order: askOrderAlice } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: askOrderBob } = (await getEventArgs(
        txAskAddOrderBob,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSIT

      // Alice and Bob will each deposit 2 units of tokenB
      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: bobOutputVault,
        amount: depositAmountB,
      };

      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenB18.transfer(bob.address, depositAmountB);
      await tokenB18.connect(alice).approve(orderBook.address, depositAmountB);
      await tokenB18.connect(bob).approve(orderBook.address, depositAmountB);

      // Alice deposits tokenB into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenB into his output vault
      await orderBook.connect(bob).deposit(depositConfigStructBob);

      // TAKE ORDER

      // Carol takes orders with direct wallet transfer
      const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
        order: askOrderAlice,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: askOrderBob,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        askRatio,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
        output: tokenA00.address,
        input: tokenB18.address,
        minimumInput: depositAmountB.mul(2),
        maximumInput: depositAmountB.mul(2),
        maximumIORatio,
        orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
      };

      // Similarly, we want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      await tokenA00.transfer(carol.address, depositAmountA.mul(2)); // 2 orders
      await tokenA00
        .connect(carol)
        .approve(orderBook.address, depositAmountA.mul(2)); // 2 orders

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
      assert(takeOrderAlice.input.eq(depositAmountB), "wrong input");
      assert(takeOrderAlice.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderAlice.takeOrder, takeOrderConfigStructAlice);

      assert(takeOrderBob.sender === carol.address, "wrong sender");
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output");
      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob);

      const tokenAAliceBalance = await tokenA00.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB18.balanceOf(alice.address);
      const tokenABobBalance = await tokenA00.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB18.balanceOf(bob.address);
      const tokenACarolBalance = await tokenA00.balanceOf(carol.address);
      const tokenBCarolBalance = await tokenB18.balanceOf(carol.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero()); // Bob has not yet withdrawn
      assert(tokenBBobBalance.isZero());
      assert(tokenACarolBalance.isZero());
      assert(tokenBCarolBalance.eq(depositAmountB.mul(2)));

      await orderBook.connect(alice).withdraw({
        token: tokenA00.address,
        vaultId: aliceInputVault,
        amount: depositAmountA,
      });
      await orderBook.connect(bob).withdraw({
        token: tokenA00.address,
        vaultId: bobInputVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA00.balanceOf(
        alice.address
      );
      const tokenABobBalanceWithdrawn = await tokenA00.balanceOf(bob.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
      assert(tokenABobBalanceWithdrawn.eq(depositAmountA));
    });
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };

    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder")

    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : bobBidOrder
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askOrderBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenB.address, // will result in mismatch
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenA.address, // will result in mismatch
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants0 = [0, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")

    const askOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants0,
      },
      data : aliceAskOrder
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askOrder0 } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // ASK ORDER 1

    const askConstants1 = [max_uint256, askRatio];
    const aliceAskOrder1 = ethers.utils.toUtf8Bytes("aliceAskOrder1")

    const askOrderConfig1: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants1,
      },
      data : aliceAskOrder1
    };

    const txAskAddOrder1 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig1);

    const { order: askOrder1 } = (await getEventArgs(
      txAskAddOrder1,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrder0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: askOrder1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants0 = [max_uint256, askRatio.add(1)]; // does exceed max ratio
    const askConstants1 = [max_uint256, askRatio]; // doesn't exceed max IO ratio
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder0 = ethers.utils.toUtf8Bytes("aliceAskOrder0")
    const aliceAskOrder1 = ethers.utils.toUtf8Bytes("aliceAskOrder1")


    const askOrderConfig0: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants0,
      },
      data : aliceAskOrder0
    };
    const askOrderConfig1: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants1,
      },
      data : aliceAskOrder1
    };

    const txAskAddOrder0 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig0);
    const txAskAddOrder1 = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig1);

    const { order: askOrder0 } = (await getEventArgs(
      txAskAddOrder0,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askOrder1 } = (await getEventArgs(
      txAskAddOrder1,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrder0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: askOrder1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")

    const askOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrder,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBad: TakeOrderConfigStruct = {
      order: { ...askOrder, owner: bob.address }, // order hash won't match any added orders
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructBad, takeOrderConfigStructGood], // test bad order before good order (when remaining input is non-zero)
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder")

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };
    const askOrderConfigBob: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : bobBidOrder
    };

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
    const txAskAddOrderBob = await orderBook
      .connect(bob)
      .addOrder(askOrderConfigBob);

    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: askOrderBob } = (await getEventArgs(
      txAskAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderBob,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

    const askRatio = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder")

    const askOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data : aliceAskOrder
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

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
      order: askOrder,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: askRatio,
      orders: [takeOrderConfigStruct],
    };

    const amountA = amountB.mul(askRatio).div(ONE);
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

  it("should take slosh order on a good path for tokens with different decimals(clear multiple orders directly from buyer wallet)", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 6;
    const tokenBDecimals = 18;
    const tokenCDecimals = 12;


    const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;  
    const tokenC12 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenCDecimals,
    ])) as ReserveTokenDecimals;  


    await tokenA18.initialize();
    await tokenB06.initialize();
    await tokenC12.initialize();


    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceVault = ethers.BigNumber.from(randomUint256());
  

    // ASK ORDERS

    // The ratio is 1:1.02 from the perspective of the expression.
    const askRatio = ethers.BigNumber.from(102 + sixteenZeros);

    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA18.address,
          decimals: tokenADecimals,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        } ,
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        }
      ],
      validOutputs: [
        {
          token: tokenA18.address,
          decimals: tokenADecimals,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        },
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        }
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data: []
    };
   

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
 
    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    // Alice and Bob will each deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(1 + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB.mul(2),
    };
   
    await tokenB06.transfer(alice.address, depositAmountB.mul(2));
   
    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB.mul(2));
 

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER BOB
    
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals )
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [ takeOrderConfigStructBob],
    };

    
    const depositAmountA = ethers.BigNumber.from(102 + '0000'); 
   
    await tokenA18.transfer(bob.address, depositAmountA); 
    await tokenA18
      .connect(bob)
      .approve(orderBook.address, depositAmountA); 

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);   

      
      const events = (await getEvents(
        txTakeOrders,
        "TakeOrder",
        orderBook
      )) as TakeOrderEvent["args"][];  
      const [takeOrderBob] = events

      assert(takeOrderBob.sender === bob.address, `wrong sender expected ${takeOrderBob.sender} got ${bob.address}`);
      assert(takeOrderBob.input.eq(depositAmountB), "wrong input");
      assert(takeOrderBob.output.eq(depositAmountA), "wrong output"); 

      compareStructs(takeOrderBob.takeOrder, takeOrderConfigStructBob); 

      const tokenAAliceBalance = await tokenA18.balanceOf(alice.address);
      const tokenBAliceBalance = await tokenB06.balanceOf(alice.address);
      const tokenABobBalance = await tokenA18.balanceOf(bob.address);
      const tokenBBobBalance = await tokenB06.balanceOf(bob.address);

      assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
      assert(tokenBAliceBalance.isZero());
      assert(tokenABobBalance.isZero());
      assert(tokenBBobBalance.eq(depositAmountB));

      await orderBook.connect(alice).withdraw({
        token: tokenA18.address,
        vaultId: aliceVault,
        amount: depositAmountA,
      });

      const tokenAAliceBalanceWithdrawn = await tokenA18.balanceOf(alice.address);
      assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));



       // TAKE ORDER Carol

    
    const takeOrderConfigStructCarol: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 2,
      outputIOIndex: 1,
    };

    
    const maximumIORatioCarol = fixedPointMul(
      askRatio,
      ethers.BigNumber.from(10).pow(18 + tokenCDecimals - tokenBDecimals)
    );

    const takeOrdersConfigStructCarol: TakeOrdersConfigStruct = {
      output: tokenC12.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio : maximumIORatioCarol ,
      orders: [ takeOrderConfigStructCarol ], 
    };

   
    const depositAmountC = ethers.BigNumber.from(102 + tenZeros);

    await tokenC12.transfer(carol.address, depositAmountC); 
    await tokenC12
      .connect(carol)
      .approve(orderBook.address, depositAmountC); 

    const txTakeOrdersCarol = await orderBook
      .connect(carol)
      .takeOrders(takeOrdersConfigStructCarol);      
    
    const events1 = (await getEvents(
      txTakeOrdersCarol,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"][];   

    const [takeOrderCarol] = events1 


    assert(takeOrderCarol.sender === carol.address, `wrong sender`);
    assert(takeOrderCarol.input.eq(depositAmountB), "wrong input");
    assert(takeOrderCarol.output.eq(depositAmountC), "wrong output"); 

    compareStructs(takeOrderCarol.takeOrder, takeOrdersConfigStructCarol); 

    const tokenBAliceBalance1 = await tokenB06.balanceOf(alice.address);
    const tokenCAliceBalance = await tokenC12.balanceOf(alice.address); 
    const tokenBCarolBalance = await tokenB06.balanceOf(carol.address);
    const tokenCCarolBalance = await tokenC12.balanceOf(carol.address);

    assert(tokenCAliceBalance.isZero()); // Alice has not yet withdrawn
    assert(tokenBAliceBalance1.isZero());
    assert(tokenCCarolBalance.isZero());
    assert(tokenBCarolBalance.eq(depositAmountB));

    await orderBook.connect(alice).withdraw({
      token: tokenC12.address,
      vaultId: aliceVault,
      amount: depositAmountC,
    });

    const tokenCAliceBalanceWithdrawn = await tokenC12.balanceOf(alice.address);
    assert(tokenCAliceBalanceWithdrawn.eq(depositAmountC));

  });    

  it("should ensure that misconfigured decimals on tokens only harm the misconfigurer", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 6;
    const tokenBDecimals = 18;
    const tokenCDecimals = 12; 

    const incorrectDeciamls = 10


    const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;  
    const tokenC12 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenCDecimals,
    ])) as ReserveTokenDecimals;  


    await tokenA18.initialize();
    await tokenB06.initialize();
    await tokenC12.initialize();


    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceVault = ethers.BigNumber.from(randomUint256());
  

    // ASK ORDERS

    // The ratio is 1:1.02 from the perspective of the expression.
    const askRatio = ethers.BigNumber.from(102 + sixteenZeros);

    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA18.address,
          decimals: incorrectDeciamls,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        } ,
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        }
      ],
      validOutputs: [
        {
          token: tokenA18.address,
          decimals: incorrectDeciamls,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        },
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        }
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data: []
    };
   

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
 
    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    // Alice and Bob will each deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(1 + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB.mul(2),
    };
   
    await tokenB06.transfer(alice.address, depositAmountB.mul(2));
   
    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB.mul(2));
 

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER BOB
    
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals )
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [ takeOrderConfigStructBob],
    };

    
    const depositAmountA = ethers.BigNumber.from(102 + '0000'); 
   
    await tokenA18.transfer(bob.address, depositAmountA); 
    await tokenA18
      .connect(bob)
      .approve(orderBook.address, depositAmountA); 

    await assertError(
      async () => await orderBook.connect(bob).takeOrders(takeOrdersConfigStruct),
      "Error: VM Exception while processing transaction: reverted with reason string 'MIN_INPUT'",
      'Take Orders with incorrect decimals executed'
    )



  }); 
  
  
  it.only("percision loss", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 18;
    const tokenBDecimals = 6;
    
    const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;  
 
    await tokenA18.initialize();
    await tokenB06.initialize();
   
    const alice = signers[1];
    const bob = signers[2];
    
    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceVault = ethers.BigNumber.from(randomUint256());
  

    // ASK ORDERS

    // The ratio is 1:1.02 from the perspective of the expression.
    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const askConstants = [max_uint256, askRatio];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskRatio,
    ]);

    const askOrderConfigAlice: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA18.address,
          decimals: tokenADecimals,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        }
      ],
      validOutputs: [
        {
          token: tokenA18.address,
          decimals: tokenADecimals,
          vaultId: aliceVault,
        }, 
        {
          token: tokenB06.address,
          decimals: tokenBDecimals,
          vaultId: aliceVault,
        }
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data: []
    };
   

    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfigAlice);
 
    const { order: askOrderAlice } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

    // Alice and Bob will each deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from('1000000');

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };
   
    await tokenB06.transfer(alice.address, depositAmountB);
   
    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);
 

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER BOB
    
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals )
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [ takeOrderConfigStructBob],
    };

    
    const depositAmountA = ethers.BigNumber.from('1000000000000000001'); 
   
    await tokenA18.transfer(bob.address, depositAmountA); 
    await tokenA18
      .connect(bob)
      .approve(orderBook.address, depositAmountA);  

    let test = await orderBook.connect(bob).takeOrders(takeOrdersConfigStruct)   
    
    let bal1 = await tokenB06.balanceOf(bob.address) 

    console.log("bal1 : " , bal1)  

    let bal2 = await orderBook.vaultBalance(alice.address,tokenA18.address,aliceVault)

    console.log("bal2 : " , bal2)  

    let bal3 = await tokenA18.balanceOf(bob.address)

    console.log("bal3 : " , bal3) 

    
    
    
    // const aliceInputVaultBalance = await orderBook.vaultBalance(
    //   alice.address,
    //   tokenA06.address,
    //   aliceInputVault
    // ); 

    // console.log("")
    






    // await assertError(
    //   async () => await orderBook.connect(bob).takeOrders(takeOrdersConfigStruct),
    //   "Error: VM Exception while processing transaction: reverted with reason string 'MIN_INPUT'",
    //   'Take Orders with incorrect decimals executed'
    // )



  });  
  
  
  
  
   
});





