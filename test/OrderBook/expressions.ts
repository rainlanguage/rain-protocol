import { assert } from "chai";

import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReserveToken18, ReserveTokenDecimals } from "../../typechain";
import {
  AddOrderEvent,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import {
  assertError,
  fixedPointMul,
  minBN,
  RainterpreterOps,
  randomUint256,
} from "../../utils";
import {
  eighteenZeros,
  max_uint256,
  ONE,
  sixZeros,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { compareStructs } from "../../utils/test/compareStructs";

import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";

const Opcode = RainterpreterOps;

describe("OrderBook expression checks", async () => {
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should ensure OWNER and COUNTERPARTY are visible in calculateIO and handleIO", async function () {
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

    const orderBook = await deployOrderBook();
    const aliceVault = ethers.BigNumber.from(randomUint256());

    //  ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const OWNER = () => op(Opcode.context, 0x0001);
    const COUNTERPARTY = () => op(Opcode.context, 0x0002);

    const constants_A = [max_uint256, ratio_A, alice.address, bob.address];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedOwner = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );

    const vExpectedCounterpart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    // prettier-ignore
    const calculateSoruce = concat([
            OWNER()  ,
            vExpectedOwner ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1) ,
            COUNTERPARTY() ,
            vExpectedCounterpart ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1)  ,
            vOutputMax,
            vRatio,
        ]);

    // prettier-ignore
    const handleIOSource = concat([
                OWNER()  ,
                vExpectedOwner ,
                op(Opcode.equal_to),
                op(Opcode.ensure, 1) ,
                COUNTERPARTY() ,
                vExpectedCounterpart ,
                op(Opcode.equal_to),
                op(Opcode.ensure, 1)
        ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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
    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

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

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
  });

  it("should ensure balance before is visible in calculateIO and handleIO", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    const depositConfigStructAliceTokenA18: DepositConfigStruct = {
      token: tokenA18.address,
      vaultId: aliceVault,
      amount: depositAmountA,
    };

    await tokenA18.transfer(alice.address, depositAmountA);

    await tokenA18.connect(alice).approve(orderBook.address, depositAmountA);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenA18);

    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

    const depositConfigStructAliceTokenB06: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);

    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenB06);

    // ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const constants_A = [max_uint256, ratio_A, depositAmountA, depositAmountB];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputTokenBalance = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputTokenBalance = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN_VAULT_BALANCE = () => op(Opcode.context, 0x0203);
    const OUTPUT_TOKEN_VAULT_BALANCE = () => op(Opcode.context, 0x0303);

    // prettier-ignore
    const calculateSoruce = concat([
            INPUT_TOKEN_VAULT_BALANCE()  ,
            vExpectedInputTokenBalance ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_VAULT_BALANCE()  ,
                vExpectedOutputTokenBalance ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1) ,
        vOutputMax,
        vRatio,
    ]);

    // prettier-ignore
    const handleIOSource = concat([
            INPUT_TOKEN_VAULT_BALANCE()  ,
            vExpectedInputTokenBalance ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_VAULT_BALANCE()  ,
            vExpectedOutputTokenBalance ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1)
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
      amount: depositAmountA.mul(2),
    });

    const tokenAAliceBalanceWithdrawn = await tokenA18.balanceOf(alice.address);
    assert(tokenAAliceBalanceWithdrawn.eq(depositAmountA.mul(2)));
  });

  it("should ensure vault id is visible in calculateIO and handleIO", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

    const depositConfigStructAliceTokenB06: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);

    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenB06);

    // ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const constants_A = [max_uint256, ratio_A, aliceVault];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedVaultId = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );

    const INPUT_TOKEN_VAULT_ID = () => op(Opcode.context, 0x0202);
    const OUTPUT_TOKEN_VAULT_ID = () => op(Opcode.context, 0x0302);

    // prettier-ignore
    const calculateSoruce = concat([
            INPUT_TOKEN_VAULT_ID()  ,
            vExpectedVaultId ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_VAULT_ID()  ,
            vExpectedVaultId ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1) ,
        vOutputMax,
        vRatio,
    ]);

    // prettier-ignore
    const handleIOSource = concat([
            INPUT_TOKEN_VAULT_ID()  ,
            vExpectedVaultId ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_VAULT_ID()  ,
            vExpectedVaultId ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1)
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
  });

  it("should ensure tokens are visible in calculateIO and handleIO", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

    const depositConfigStructAliceTokenB06: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);

    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenB06);

    // ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const constants_A = [
      max_uint256,
      ratio_A,
      tokenA18.address,
      tokenB06.address,
    ];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputToken = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputToken = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN = () => op(Opcode.context, 0x0200);
    const OUTPUT_TOKEN = () => op(Opcode.context, 0x0300);

    // prettier-ignore
    const calculateSoruce = concat([
            INPUT_TOKEN()  ,
            vExpectedInputToken ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN()  ,
            vExpectedOutputToken ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1) ,
        vOutputMax,
        vRatio,
    ]);

    // prettier-ignore
    const handleIOSource = concat([
            INPUT_TOKEN()  ,
            vExpectedInputToken ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN()  ,
            vExpectedOutputToken ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1)
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
  });

  it("should ensure decimals are visible in calculateIO and handleIO", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

    const depositConfigStructAliceTokenB06: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);

    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenB06);

    // ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const constants_A = [max_uint256, ratio_A, tokenADecimals, tokenBDecimals];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputTokenDecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputTokenDecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN_DECIMALS = () => op(Opcode.context, 0x0201);
    const OUTPUT_TOKEN_DECIMALS = () => op(Opcode.context, 0x0301);

    // prettier-ignore
    const calculateSoruce = concat([
            INPUT_TOKEN_DECIMALS()  ,
            vExpectedInputTokenDecimals ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_DECIMALS()  ,
            vExpectedOutputTokenDecimals ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1) ,
        vOutputMax,
        vRatio,
    ]);

    // prettier-ignore
    const handleIOSource = concat([
            INPUT_TOKEN_DECIMALS()  ,
            vExpectedInputTokenDecimals ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,
            OUTPUT_TOKEN_DECIMALS()  ,
            vExpectedOutputTokenDecimals ,
            op(Opcode.equal_to),
            op(Opcode.ensure, 1)
    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
  });

  it("should ensure SET in calculateIO is visible in GET in handleIO", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    const depositAmountA = ethers.BigNumber.from(1 + eighteenZeros);

    const depositAmountB = ethers.BigNumber.from(1 + sixZeros);

    const depositConfigStructAliceTokenB06: DepositConfigStruct = {
      token: tokenB06.address,
      vaultId: aliceVault,
      amount: depositAmountB,
    };

    await tokenB06.transfer(alice.address, depositAmountB);

    await tokenB06.connect(alice).approve(orderBook.address, depositAmountB);

    await orderBook.connect(alice).deposit(depositConfigStructAliceTokenB06);

    // ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);
    const key1 = ethers.BigNumber.from(randomUint256());
    const key2 = ethers.BigNumber.from(randomUint256());
    const key3 = ethers.BigNumber.from(randomUint256());

    const constants_A = [
      max_uint256,
      ratio_A,
      key1,
      key2,
      key3,
      tokenADecimals,
      tokenBDecimals,
    ];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const compareKey = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const inputTokenKey = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );
    const outputTokenKey = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 4)
    );

    const vExpectedInputTokenDecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 5)
    );
    const vExpectedOutputTokenDecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 6)
    );

    const INPUT_TOKEN_DECIMALS = () => op(Opcode.context, 0x0201);
    const OUTPUT_TOKEN_DECIMALS = () => op(Opcode.context, 0x0301);

    // prettier-ignore
    const calculateSoruce= concat([
        compareKey ,
           INPUT_TOKEN_DECIMALS() ,
           OUTPUT_TOKEN_DECIMALS() ,
          op(Opcode.greater_than),
        op(Opcode.set),

        inputTokenKey ,
          INPUT_TOKEN_DECIMALS(),
        op(Opcode.set),

        outputTokenKey ,
          OUTPUT_TOKEN_DECIMALS(),
        op(Opcode.set),
        vOutputMax,
        vRatio,
    ]);

    // prettier-ignore
    const handleIOSource = concat([
          compareKey,
        op(Opcode.get),
        op(Opcode.ensure, 1)  ,

          inputTokenKey,
        op(Opcode.get),
        vExpectedInputTokenDecimals ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1) ,

          outputTokenKey,
        op(Opcode.get),
        vExpectedOutputTokenDecimals ,
        op(Opcode.equal_to),
        op(Opcode.ensure, 1)

    ]);

    const EvaluableConfigAlice = await generateEvaluableConfig(
      [calculateSoruce, handleIOSource],
      constants_A
    );

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

    await tokenA18.transfer(bob.address, depositAmountA);
    await tokenA18.connect(bob).approve(orderBook.address, depositAmountA);

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

    compareStructs(takeOrder, takeOrderConfigStructBob);

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
  });

  it("should ensure balance diff is zero in calculateIO and actual value in handleIO", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const INPUT_BALANCE_DIFF = () => op(Opcode.context, 0x0204);
    const OUTPUT_BALANCE_DIFF = () => op(Opcode.context, 0x0304);

    // ORDERS
    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const aip = minBN(amountB, minBN(max_uint256, amountB)); // minimum of remainingInput and outputMax
    const aop = fixedPointMul(aip, ratio_A);

    const constants_A = [max_uint256, ratio_A, aip, aop];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputDiff = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputDiff = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    // prettier-ignore
    const calculateSoruce = concat([
       INPUT_BALANCE_DIFF()  ,
      op(Opcode.ensure, 0) ,
       OUTPUT_BALANCE_DIFF()  ,
      op(Opcode.ensure, 0) ,
      vOutputMax,
      vRatio,

    ]);

    // prettier-ignore
    const handleSource = concat([
        INPUT_BALANCE_DIFF()  ,
        vExpectedOutputDiff ,
       op(Opcode.equal_to),
      op(Opcode.ensure, 1) ,
        OUTPUT_BALANCE_DIFF()  ,
        vExpectedInputDiff ,
       op(Opcode.equal_to),
      op(Opcode.ensure, 1)
   ]);

    const aliceOrder = ethers.utils.toUtf8Bytes("aliceOrder");

    const EvaluableConfig = await generateEvaluableConfig(
      [calculateSoruce, handleSource],
      constants_A
    );

    const OrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig,
      data: aliceOrder,
    };

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

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

  it("should ensure accessing calcualtions context during calculation reverts", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS
    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const constants_A = [max_uint256, ratio_A, amountB];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const OUTPUT_MAX = () => op(Opcode.context, 0x0100);
    const ORDER_RATIO = () => op(Opcode.context, 0x0101);

    // prettier-ignore
    const calculateSoruce = concat([
      OUTPUT_MAX() ,
      ORDER_RATIO() ,
      vOutputMax,
      vRatio
    ]);

    const aliceOrder = ethers.utils.toUtf8Bytes("aliceOrder");
    const EvaluableConfig = await generateEvaluableConfig(
      [calculateSoruce, []],
      constants_A
    );

    const OrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig,
      data: aliceOrder,
    };

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSIT

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

    await assertError(
      async () =>
        await orderBook.connect(bob).takeOrders(takeOrdersConfigStruct),
      "VM Exception while processing transaction: reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)",
      "Accessed Calculations Context in Calculations"
    );
  });

  it("should scale outputMax to token deciamls and cap it to the vault balance of the owner", async function () {
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

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio_A = ethers.BigNumber.from(10).pow(18);

    // Alice and Bob will each deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

    const constants_A = [max_uint256, ratio_A, depositAmountB];
    const vOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedOutputMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    // prettier-ignore
    const calculateSoruce = concat([
      vOutputMax,
      vRatio,
    ]);

    const OUTPUT_MAX = () => op(Opcode.context, 0x0100);
    // prettier-ignore
    const handleSource = concat([
        vExpectedOutputMax,
        OUTPUT_MAX(),
       op(Opcode.equal_to) ,
      op(Opcode.ensure,1)
    ]);

    const EvaluableConfig = await generateEvaluableConfig(
      [calculateSoruce, handleSource],
      constants_A
    );

    const OrderConfigAlice: OrderConfigStruct = {
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
      evaluableConfig: EvaluableConfig,
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
    const depositAmountA = fixedPointMul(
      depositAmountB,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

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
});
