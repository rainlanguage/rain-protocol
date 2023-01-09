import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveTokenDecimals,
} from "../../typechain";
import {
  AddOrderEvent,
  DepositConfigStruct,
  OrderConfigStruct,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { fixedPointMul, RainterpreterOps, randomUint256 } from "../../utils";
import {
  eighteenZeros,
  max_uint256,
  sixZeros,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = RainterpreterOps;

describe("OrderBook expression checks", async () => {
  let orderBookFactory: ContractFactory;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;
    const aliceVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const OWNER = () => op(Opcode.CONTEXT, 0x0001);
    const COUNTERPARTY = () => op(Opcode.CONTEXT, 0x0002);

    const askConstants = [max_uint256, askRatio, alice.address, bob.address];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedOwner = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );

    const vExpectedCounterpart = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );

    // prettier-ignore
    const askSource = concat([   
            OWNER()  , 
            vExpectedOwner , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) ,  
            COUNTERPARTY() ,
            vExpectedCounterpart , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1)  ,
            vAskOutputMax,
            vAskRatio, 
        ]);

    // prettier-ignore
    const handleIOSource = concat([   
                OWNER()  , 
                vExpectedOwner , 
                op(Opcode.EQUAL_TO), 
                op(Opcode.ENSURE, 1) ,  
                COUNTERPARTY() ,
                vExpectedCounterpart , 
                op(Opcode.EQUAL_TO), 
                op(Opcode.ENSURE, 1)  
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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

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

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const askConstants = [
      max_uint256,
      askRatio,
      depositAmountA,
      depositAmountB,
    ];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputTokenBalance = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputTokenBalance = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN_VAULT_BALANCE = () => op(Opcode.CONTEXT, 0x0203);
    const OUTPUT_TOKEN_VAULT_BALANCE = () => op(Opcode.CONTEXT, 0x0303);

    // prettier-ignore
    const askSource = concat([   
            INPUT_TOKEN_VAULT_BALANCE()  , 
            vExpectedInputTokenBalance , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_VAULT_BALANCE()  , 
                vExpectedOutputTokenBalance , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) ,   
        vAskOutputMax,
        vAskRatio, 
    ]);

    // prettier-ignore
    const handleIOSource = concat([   
            INPUT_TOKEN_VAULT_BALANCE()  , 
            vExpectedInputTokenBalance , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_VAULT_BALANCE()  , 
            vExpectedOutputTokenBalance , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) 
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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

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

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const askConstants = [max_uint256, askRatio, aliceVault];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedVaultId = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );

    const INPUT_TOKEN_VAULT_ID = () => op(Opcode.CONTEXT, 0x0202);
    const OUTPUT_TOKEN_VAULT_ID = () => op(Opcode.CONTEXT, 0x0302);

    // prettier-ignore
    const askSource = concat([   
            INPUT_TOKEN_VAULT_ID()  , 
            vExpectedVaultId , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_VAULT_ID()  , 
            vExpectedVaultId , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) ,   
        vAskOutputMax,
        vAskRatio, 
    ]);

    // prettier-ignore
    const handleIOSource = concat([   
            INPUT_TOKEN_VAULT_ID()  , 
            vExpectedVaultId , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_VAULT_ID()  , 
            vExpectedVaultId , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) 
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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

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

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const askConstants = [
      max_uint256,
      askRatio,
      tokenA18.address,
      tokenB06.address,
    ];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputToken = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputToken = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN = () => op(Opcode.CONTEXT, 0x0200);
    const OUTPUT_TOKEN = () => op(Opcode.CONTEXT, 0x0300);

    // prettier-ignore
    const askSource = concat([   
            INPUT_TOKEN()  , 
            vExpectedInputToken , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN()  , 
            vExpectedOutputToken , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) ,   
        vAskOutputMax,
        vAskRatio, 
    ]);

    // prettier-ignore
    const handleIOSource = concat([   
            INPUT_TOKEN()  , 
            vExpectedInputToken , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN()  , 
            vExpectedOutputToken , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) 
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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

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

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

    const askConstants = [
      max_uint256,
      askRatio,
      tokenADecimals,
      tokenBDecimals,
    ];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vExpectedInputTokenDecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vExpectedOutputTokenDecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );

    const INPUT_TOKEN_DECIMALS = () => op(Opcode.CONTEXT, 0x0201);
    const OUTPUT_TOKEN_DECIMALS = () => op(Opcode.CONTEXT, 0x0301);

    // prettier-ignore
    const askSource = concat([   
            INPUT_TOKEN_DECIMALS()  , 
            vExpectedInputTokenDecimals , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_DECIMALS()  , 
            vExpectedOutputTokenDecimals , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1) ,   
        vAskOutputMax,
        vAskRatio, 
    ]);

    // prettier-ignore
    const handleIOSource = concat([   
            INPUT_TOKEN_DECIMALS()  , 
            vExpectedInputTokenDecimals , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) ,
            OUTPUT_TOKEN_DECIMALS()  , 
            vExpectedOutputTokenDecimals , 
            op(Opcode.EQUAL_TO), 
            op(Opcode.ENSURE, 1)
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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

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

    // ASK ORDERS

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
    const key1 = ethers.BigNumber.from(randomUint256());
    const key2 = ethers.BigNumber.from(randomUint256());
    const key3 = ethers.BigNumber.from(randomUint256());

    const askConstants = [
      max_uint256,
      askRatio,
      key1,
      key2,
      key3,
      tokenADecimals,
      tokenBDecimals,
    ];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const compareKey = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );
    const inputTokenKey = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );
    const outputTokenKey = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 4)
    );

    const vExpectedInputTokenDecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 5)
    );
    const vExpectedOutputTokenDecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 6)
    );

    const INPUT_TOKEN_DECIMALS = () => op(Opcode.CONTEXT, 0x0201);
    const OUTPUT_TOKEN_DECIMALS = () => op(Opcode.CONTEXT, 0x0301);

    // prettier-ignore
    const askSource = concat([     
        compareKey ,
           INPUT_TOKEN_DECIMALS() ,
           OUTPUT_TOKEN_DECIMALS() ,
          op(Opcode.GREATER_THAN),  
        op(Opcode.SET),  

        inputTokenKey ,
          INPUT_TOKEN_DECIMALS(), 
        op(Opcode.SET), 

        outputTokenKey ,
          OUTPUT_TOKEN_DECIMALS(), 
        op(Opcode.SET), 
        vAskOutputMax,
        vAskRatio, 
    ]);

    // prettier-ignore
    const handleIOSource = concat([   
          compareKey,
        op(Opcode.GET), 
        op(Opcode.ENSURE, 1)  ,
        
          inputTokenKey,
        op(Opcode.GET), 
        vExpectedInputTokenDecimals , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) , 

          outputTokenKey,
        op(Opcode.GET), 
        vExpectedOutputTokenDecimals , 
        op(Opcode.EQUAL_TO), 
        op(Opcode.ENSURE, 1) 

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
      interpreterStateConfig: {
        sources: [askSource, handleIOSource],
        constants: askConstants,
      },
      data: [],
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

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: askOrderAlice,
      inputIOIndex: 0,
      outputIOIndex: 1,
    };

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      askRatio,
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
});
