import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  ReserveToken18,
  ReserveTokenDecimals,
} from "../../typechain";
import {
  AddOrderEvent,
  ContextEvent,
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
  RainterpreterOps,
  assertError,
  fixedPointMul,
  randomUint256,
  minBN,
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
import { getEventArgs, getEvents } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { getOrderConfig } from "../../utils/orderBook/order";
import { compareStructs } from "../../utils/test/compareStructs";
import { getRainContractMetaBytes } from "../../utils";

const Opcode = RainterpreterOps;

describe("OrderBook take orders", async function () {
  let orderBookFactory: ContractFactory;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should respect output maximum of a given order", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const outputMax_A = amountB.sub(1); // will only sell 999 tokenBs to each buyer
    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      outputMax_A,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const bobOrder = ethers.utils.toUtf8Bytes("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      outputMax_A,
      tokenA.address,
      18,
      bobInputVault,
      tokenB.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);
    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: Order_B } = (await getEventArgs(
      txAddOrderBob,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_B,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct),
      `MinimumInput(${amountB.mul(2)}, ${amountB.mul(2).sub(2)})`,
      "did not respect order output max"
    );
  });

  it("should validate minimum input", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const bobOrder = ethers.utils.toUtf8Bytes("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      bobInputVault,
      tokenB.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);
    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: Order_B } = (await getEventArgs(
      txAddOrderBob,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_B,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // min > max should ALWAYS fail
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2).add(1), // gt total vault deposits
      maximumInput: amountB.mul(2).add(1),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct2: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A.sub(1), // lt actual ratio
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct0),
      `MinimumInput(${amountB.mul(2).add(1)}, ${amountB.mul(2)})`,
      "did not validate minimum input gt maximum input"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct1),
      `MinimumInput(${amountB.mul(2).add(1)}, ${amountB.mul(2)})`,
      "did not validate minimum input gt total deposits"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct2),
      `MinimumInput(${amountB.mul(2)}, 0)`,
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const vaultId = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio = ethers.BigNumber.from("10").pow(18);
    const constants = [max_uint256, ratio];
    const vInfinity = op(
      Opcode.readMemory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const source = concat([
      vInfinity,
      vRatio,
    ]);

    const evaluableConfig = await generateEvaluableConfig({
      sources: [source, []],
      constants,
    });

    const orderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenX.address, decimals: XDec, vaultId },
        { token: tokenY.address, decimals: YDec, vaultId },
      ],
      validOutputs: [
        { token: tokenX.address, decimals: XDec, vaultId },
        { token: tokenY.address, decimals: YDec, vaultId },
      ],
      evaluableConfig: evaluableConfig,
      data: [],
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA20.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA20.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA18.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA18.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB20.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB20.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB18.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA00.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA00.address,
        tokenADecimals,
        bobInputVault,
        tokenB18.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA20.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA20.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA18.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA18.address,
        tokenADecimals,
        bobInputVault,
        tokenB06.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB20.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB20.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        bobInputVault,
        tokenB18.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

      const orderBook = (await orderBookFactory.deploy(
        getRainContractMetaBytes("orderbook")
      )) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());

      // ORDERS

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA00.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        null
      );

      const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA00.address,
        tokenADecimals,
        bobInputVault,
        tokenB18.address,
        tokenBDecimals,
        bobOutputVault,
        null
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);

      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        order: Order_A,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };
      const takeOrderConfigStructBob: TakeOrderConfigStruct = {
        order: Order_B,
        inputIOIndex: 0,
        outputIOIndex: 0,
      };

      // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
      const maximumIORatio = fixedPointMul(
        ratio_A,
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");
    const bobOrder = ethers.utils.toUtf8Bytes("Order_B");

    // ORDERS

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      bobInputVault,
      tokenB.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);
    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: Order_B } = (await getEventArgs(
      txAddOrderBob,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_B,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct0: TakeOrdersConfigStruct = {
      output: tokenB.address, // will result in mismatch
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };
    const takeOrdersConfigStruct1: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenA.address, // will result in mismatch
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
    await tokenA.transfer(carol.address, amountA.mul(2));
    await tokenA.connect(carol).approve(orderBook.address, amountA.mul(2));

    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct0),
      `TokenMismatch("${tokenA.address}", "${tokenB.address}")`,
      "did not validate output token"
    );
    await assertError(
      async () =>
        await orderBook.connect(carol).takeOrders(takeOrdersConfigStruct1),
      `TokenMismatch("${tokenB.address}", "${tokenA.address}")`,
      "did not validate input token"
    );
  });

  it("should emit event when an order has zero output max amount", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDER 0

    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A0: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      ethers.BigNumber.from(0),
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice0 = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A0);

    const { order: Order_A0 } = (await getEventArgs(
      txAddOrderAlice0,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // ASK ORDER 1

    const OrderConfig_A1: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice1 = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A1);

    const { order: Order_A1 } = (await getEventArgs(
      txAddOrderAlice1,
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
      order: Order_A0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: Order_A1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder0 = ethers.utils.toUtf8Bytes("Order0");
    const aliceOrder1 = ethers.utils.toUtf8Bytes("Order1");

    // ASK ORDER 0

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A0: OrderConfigStruct = await getOrderConfig(
      ratio_A.add(1),
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder0
    );
    const OrderConfig_A1: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder1
    );

    const txAddOrder0 = await orderBook.connect(alice).addOrder(OrderConfig_A0);
    const txAddOrder1 = await orderBook.connect(alice).addOrder(OrderConfig_A1);

    const { order: Order_A0 } = (await getEventArgs(
      txAddOrder0,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: Order_A1 } = (await getEventArgs(
      txAddOrder1,
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
      order: Order_A0,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStruct1: TakeOrderConfigStruct = {
      order: Order_A1,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStruct0, takeOrderConfigStruct1],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("aliceOrder");

    // ASK ORDER

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBad: TakeOrderConfigStruct = {
      order: { ...Order_A, owner: bob.address }, // order hash won't match any added orders
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructBad, takeOrderConfigStructGood], // test bad order before good order (when remaining input is non-zero)
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");
    const bobOrder = ethers.utils.toUtf8Bytes("Order_B");

    // ORDERS

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      bobInputVault,
      tokenB.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);
    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];
    const { order: Order_B } = (await getEventArgs(
      txAddOrderBob,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };
    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_B,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB.mul(2),
      maximumInput: amountB.mul(2),
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStructAlice, takeOrderConfigStructBob],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

    // ASK ORDER

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStruct],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1.02 from the perspective of the expression.
    const ratio_A = ethers.BigNumber.from(102 + sixteenZeros);

    const constants_A = [max_uint256, ratio_A];
    const aOpMax = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const aRatio = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const source_A = concat([
      aOpMax,
      aRatio,
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    const OrderConfigAlice: OrderConfigStruct = {
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
        },
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        },
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
        },
      ],
      evaluableConfig: EvaluableConfigAlice,
      data: [],
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
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

    await tokenB06
      .connect(alice)
      .approve(orderBook.address, depositAmountB.mul(2));

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [takeOrderConfigStructBob],
    };

    const depositAmountA = ethers.BigNumber.from(102 + "0000");

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const events = (await getEvents(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"][];
    const [takeOrderBob] = events;

    assert(
      takeOrderBob.sender === bob.address,
      `wrong sender expected ${takeOrderBob.sender} got ${bob.address}`
    );
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
      order: Order_A,
      inputIOIndex: 2,
      outputIOIndex: 1,
    };

    const maximumIORatioCarol = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenCDecimals - tokenBDecimals)
    );

    const takeOrdersConfigStructCarol: TakeOrdersConfigStruct = {
      output: tokenC12.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio: maximumIORatioCarol,
      orders: [takeOrderConfigStructCarol],
    };

    const depositAmountC = ethers.BigNumber.from(102 + tenZeros);

    await tokenC12.transfer(carol.address, depositAmountC);
    await tokenC12.connect(carol).approve(orderBook.address, depositAmountC);

    const txTakeOrdersCarol = await orderBook
      .connect(carol)
      .takeOrders(takeOrdersConfigStructCarol);

    const events1 = (await getEvents(
      txTakeOrdersCarol,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"][];

    const [takeOrderCarol] = events1;

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

    const incorrectDeciamls = 10;

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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1.02 from the perspective of the expression.
    const ratio_A = ethers.BigNumber.from(102 + sixteenZeros);

    const constants_A = [max_uint256, ratio_A];
    const aOpMax = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const aRatio = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const source_A = concat([
      aOpMax,
      aRatio,
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    const OrderConfigAlice: OrderConfigStruct = {
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
        },
        {
          token: tokenC12.address,
          decimals: tokenCDecimals,
          vaultId: aliceVault,
        },
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
        },
      ],
      evaluableConfig: EvaluableConfigAlice,
      data: [],
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
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

    await tokenB06
      .connect(alice)
      .approve(orderBook.address, depositAmountB.mul(2));

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB,
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [takeOrderConfigStructBob],
    };

    const depositAmountA = ethers.BigNumber.from(102 + "0000");

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

    await assertError(
      async () =>
        await orderBook.connect(bob).takeOrders(takeOrdersConfigStruct),
      `MinimumInput(${depositAmountB}, 0)`,
      "Take Orders without hitting minimum input executed"
    );
  });

  it("should validate context emitted in context event when handleIO dispatch is zero", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("aliceOrder");

    // ASK ORDER

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { order: Order_A, orderHash: hashOrder_A } = (await getEventArgs(
      txAddOrder,
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
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA.address,
      input: tokenB.address,
      minimumInput: amountB,
      maximumInput: amountB,
      maximumIORatio: ratio_A,
      orders: [takeOrderConfigStruct],
    };

    const amountA = amountB.mul(ratio_A).div(ONE);
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

    // Asserting Context Events
    const contextEvents = (await getEvents(
      txTakeOrders,
      "Context",
      orderBook
    )) as ContextEvent["args"][];

    const { sender: sender0, context: context0_ } = contextEvents[0];

    assert(sender0 === bob.address);

    const aip = minBN(amountB, minBN(max_uint256, amountB)); // minimum of remainingInput and outputMax
    const aop = fixedPointMul(aip, ratio_A);
    const opMax = minBN(max_uint256, amountB);

    const expectedEvent0 = [
      [
        hashOrder_A,
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(bob.address),
      ],
      [opMax, ratio_A],
      [
        ethers.BigNumber.from(tokenA.address),
        ethers.BigNumber.from(18),
        aliceInputVault,
        0,
        aop,
      ],
      [
        ethers.BigNumber.from(tokenB.address),
        ethers.BigNumber.from(18),
        aliceOutputVault,
        amountB,
        aip,
      ],
    ];

    for (let i = 0; i < expectedEvent0.length; i++) {
      const rowArray = expectedEvent0[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context0_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                         expected  ${colElement}
                         got       ${context0_[i][j]}`);
        }
      }
    }
  });

  it("precision check for takeOrders (6 vs 18) ", async function () {
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio_A = ethers.BigNumber.from("1000000000000034567");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA18.address,
      tokenADecimals,
      aliceInputVault,
      tokenB06.address,
      tokenBDecimals,
      aliceOutputVault,
      null
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT
    // Alice  will  deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceOutputVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);
    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER

    // Bob takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA18.address,
      input: tokenB06.address,
      minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [takeOrderConfigStructAlice],
    };

    // We want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
    const depositAmountA = fixedPointMul(depositAmountB, maximumIORatio);

    await tokenA18.transfer(bob.address, depositAmountA); // 2 orders
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA); // 2 orders

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const { sender, takeOrder, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(takeOrder, takeOrderConfigStructAlice);

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
      vaultId: aliceInputVault,
      amount: depositAmountA,
    });

    const tokenAAliceBalanceWithdrawn = await tokenA18.balanceOf(alice.address);
    assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
  });

  it("precision check for takeOrders(18 vs 6)", async function () {
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio_A = ethers.BigNumber.from("1999765000000034567");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA06.address,
      tokenADecimals,
      aliceInputVault,
      tokenB18.address,
      tokenBDecimals,
      aliceOutputVault,
      null
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT
    // Alice  will  deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB18.address,
      vaultId: aliceOutputVault,
      amount: depositAmountB,
    };

    await tokenB18.transfer(alice.address, depositAmountB);
    await tokenB18.connect(alice).approve(orderBook.address, depositAmountB);

    // Alice deposits tokenB into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);

    // TAKE ORDER

    // Bob takes orders with direct wallet transfer
    const takeOrderConfigStructAlice: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 0,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    ).add(ethers.BigNumber.from(1)); // Rounded Up

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: tokenA06.address,
      input: tokenB18.address,
      minimumInput: depositAmountB, // 2 orders, without outputMax limit this would be depositAmountB.mul(2)
      maximumInput: depositAmountB,
      maximumIORatio,
      orders: [takeOrderConfigStructAlice],
    };

    // We want Carol to only approve exactly what is necessary to take the orders. We scale the tokenB deposit amount 'up' by the difference between A decimals and B decimals.
    const depositAmountA = fixedPointMul(depositAmountB, maximumIORatio);

    await tokenA06.transfer(bob.address, depositAmountA); // 2 orders
    await tokenA06.connect(bob).approve(orderBook.address, depositAmountA); // 2 orders

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const { sender, takeOrder, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(takeOrder, takeOrderConfigStructAlice);

    const tokenAAliceBalance = await tokenA06.balanceOf(alice.address);
    const tokenBAliceBalance = await tokenB18.balanceOf(alice.address);
    const tokenABobBalance = await tokenA06.balanceOf(bob.address);
    const tokenBBobBalance = await tokenB18.balanceOf(bob.address);

    assert(tokenAAliceBalance.isZero()); // Alice has not yet withdrawn
    assert(tokenBAliceBalance.isZero());
    assert(tokenABobBalance.isZero());
    assert(tokenBBobBalance.eq(depositAmountB));

    await orderBook.connect(alice).withdraw({
      token: tokenA06.address,
      vaultId: aliceInputVault,
      amount: depositAmountA,
    });

    const tokenAAliceBalanceWithdrawn = await tokenA06.balanceOf(alice.address);
    assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA));
  });
});
