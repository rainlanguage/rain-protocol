import { strict as assert } from "assert";

import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReserveToken18, ReserveTokenDecimals } from "../../typechain";
import {
  AddOrderEvent,
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import {
  assertError,
  fixedPointDiv,
  fixedPointMul,
  getCallerMetaForContract,
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
  op,
  opMetaHash,
  standardEvaluableConfig,
} from "../../utils/interpreter/interpreter";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import { encodeMeta } from "../../utils/orderBook/order";
import { rainlang } from "../../utils/extensions/rainlang";
import { SignedContextV1Struct } from "../../typechain/contracts/lobby/Lobby";

const Opcode = RainterpreterOps;

describe("OrderBook expression checks", async () => {
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;
  const callerMetaHash = getCallerMetaForContract("orderbook");

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

  it("should add Order_A and Order_B and clear the order with signed context", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    //Random Context Values

    const contextValA = randomUint256();
    const contextValB = randomUint256();

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const aliceOrder = encodeMeta("Order_A");

    const { sources: orderConfigSourceA, constants: ordeConfigConstantsA } =
      await standardEvaluableConfig(
        rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash}

      /* source */
      : ensure(equal-to(${bob.address} context<5 0>())),
      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */
      : ensure(equal-to(${bob.address} context<5 0>()));
      : ensure(equal-to(${contextValB} context<6 0>()));
      `
      );

    const evaluableConfigA = await generateEvaluableConfig(
      orderConfigSourceA,
      ordeConfigConstantsA
    );
    const OrderConfig_A: OrderConfigStruct = {
      validInputs: [
        {
          token: tokenA.address,
          decimals: 18,
          vaultId: aliceInputVault,
        },
      ],
      validOutputs: [
        {
          token: tokenB.address,
          decimals: 18,
          vaultId: aliceOutputVault,
        },
      ],
      evaluableConfig: evaluableConfigA,
      meta: aliceOrder,
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const { sources: orderConfigSourceB, constants: orderConfigConstantsB } =
      await standardEvaluableConfig(
        rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash}

      /* source */
      : ensure(equal-to(${alice.address} context<5 0>())),
      _: ${max_uint256},
      _: ${ratio_B};
      
      /* HANDLE IO */
      : ensure(equal-to(${alice.address} context<5 0>()));
      : ensure(equal-to(${contextValA} context<6 0>()));
      `
      );

    const evaluableConfigB = await generateEvaluableConfig(
      orderConfigSourceB,
      orderConfigConstantsB
    );

    const OrderConfig_B: OrderConfigStruct = {
      validInputs: [
        {
          token: tokenB.address,
          decimals: 18,
          vaultId: bobInputVault,
        },
      ],
      validOutputs: [
        {
          token: tokenA.address,
          decimals: 18,
          vaultId: bobOutputVault,
        },
      ],
      evaluableConfig: evaluableConfigB,
      meta: bobOrder,
    };

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

    // DEPOSITS

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

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    //Building Signed Context A
    const contextA = [contextValA];
    const hashA = solidityKeccak256(["uint256[]"], [contextA]);
    const goodSignatureA = await alice.signMessage(arrayify(hashA));

    const signedContextsA: SignedContextV1Struct[] = [
      {
        signer: alice.address,
        signature: goodSignatureA,
        context: contextA,
      },
    ];

    //Building Signed Context B
    const contextB = [contextValB];
    const hashB = solidityKeccak256(["uint256[]"], [contextB]);
    const goodSignatureB = await bob.signMessage(arrayify(hashB));

    const signedContextsB: SignedContextV1Struct[] = [
      {
        signer: bob.address,
        signature: goodSignatureB,
        context: contextB,
      },
    ];

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, signedContextsA, signedContextsB);

    const {
      sender: clearSender,
      alice: clearA_,
      bob: clearB_,
      clearConfig: clearBountyConfig,
    } = (await getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender, clearStateChange: clearStateChange } =
      (await getEventArgs(
        txClearOrder,
        "AfterClear",
        orderBook
      )) as AfterClearEvent["args"];

    const aOutputMaxExpected = amountA;
    const bOutputMaxExpected = amountB;

    const aOutputExpected = minBN(
      aOutputMaxExpected,
      fixedPointMul(ratio_B, amountA)
    );
    const bOutputExpected = minBN(
      bOutputMaxExpected,
      fixedPointMul(ratio_A, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aliceOutput: aOutputExpected,
      bobOutput: bOutputExpected,
      aliceInput: fixedPointMul(ratio_A, aOutputExpected),
      bobInput: fixedPointMul(ratio_B, bOutputExpected),
    };

    assert(afterClearSender === bountyBot.address);
    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, Order_A);
    compareSolStructs(clearB_, Order_B);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);
  });

  it("should ensure signed context is visible in calculateIO and handleIO for takeOrder", async function () {
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

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();

    const aliceVault = ethers.BigNumber.from(randomUint256());

    // Random Context Value
    const contextVal1 = randomUint256();
    const contextVal2 = randomUint256();

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      order-taker : ${bob.address} ,
      context-val-1 : ${contextVal1} ,
      context-val-2 : ${contextVal2} ,

      
      : ensure(equal-to(order-taker context<5 0>())),
      : ensure(equal-to(context-val-1 context<6 0>())),
      : ensure(equal-to(context-val-2 context<6 1>())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      order-taker : ${bob.address} ,
      context-val-1 : ${contextVal1} ,
      context-val-2 : ${contextVal2} , 

      : ensure(equal-to(order-taker context<5 0>())),
      : ensure(equal-to(context-val-1 context<6 0>())),
      : ensure(equal-to(context-val-2 context<6 1>()));
      `
    );

    // prettier-ignore

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const context1 = [contextVal1, contextVal2];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await bob.signMessage(arrayify(hash1));

    const signedContexts1: SignedContextV1Struct[] = [
      {
        signer: bob.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: signedContexts1,
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

  it("should ensure order sender and contract address are visible in calculateIO and handleIO", async function () {
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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-sender : ${bob.address} ,
      orderbook : ${orderBook.address} ,
      
      : ensure(equal-to(expected-sender context<0 0>())),
      : ensure(equal-to(orderbook  context<0 1>())),
      : ensure(equal-to(expected-sender  orderbook-caller-address())),
      : ensure(equal-to(orderbook  orderbook-contract-address())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-sender : ${bob.address} ,
      orderbook : ${orderBook.address} ,
      
      : ensure(equal-to(expected-sender context<0 0>())),
      : ensure(equal-to(orderbook  context<0 1>())),
      : ensure(equal-to(expected-sender  orderbook-caller-address())),
      : ensure(equal-to(orderbook  orderbook-contract-address()));
      `
    );

    // prettier-ignore

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();
    const aliceVault = ethers.BigNumber.from(randomUint256());

    //  ORDERS

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-owner : ${alice.address} ,
      expected-counterparty : ${bob.address} ,
      
      : ensure(equal-to(expected-owner context<1 1>())),
      : ensure(equal-to(expected-counterparty  context<1 2>())),
      : ensure(equal-to(expected-owner  order-owner-address())),
      : ensure(equal-to(expected-counterparty   counterparty-address())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-owner : ${alice.address} ,
      expected-counterparty : ${bob.address} ,
      
      : ensure(equal-to(expected-owner context<1 1>())),
      : ensure(equal-to(expected-counterparty  context<1 2>())),
      : ensure(equal-to(expected-owner  order-owner-address())),
      : ensure(equal-to(expected-counterparty  counterparty-address()));
      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-input-token-balance : ${depositAmountA} ,
      expected-output-token-balance : ${depositAmountB} ,
      
      : ensure(equal-to(expected-input-token-balance context<3 3>())),
      : ensure(equal-to(expected-output-token-balance  context<4 3>())),
      : ensure(equal-to(expected-input-token-balance  vault-input-balance-before())),
      : ensure(equal-to(expected-output-token-balance   vault-output-balance-before())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-input-token-balance : ${depositAmountA} ,
      expected-output-token-balance : ${depositAmountB} ,
      
      : ensure(equal-to(expected-input-token-balance context<3 3>())),
      : ensure(equal-to(expected-output-token-balance  context<4 3>())),
      : ensure(equal-to(expected-input-token-balance  vault-input-balance-before())),
      : ensure(equal-to(expected-output-token-balance  vault-output-balance-before()));
      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-vault-id : ${aliceVault} ,
      
      : ensure(equal-to(expected-vault-id context<3 2>())),
      : ensure(equal-to(expected-vault-id  context<4 2>())),
      : ensure(equal-to(expected-vault-id vault-input-id())),
      : ensure(equal-to(expected-vault-id   vault-output-id())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-vault-id : ${aliceVault} ,
      
      : ensure(equal-to(expected-vault-id context<3 2>())),
      : ensure(equal-to(expected-vault-id  context<4 2>())),
      : ensure(equal-to(expected-vault-id vault-input-id())),
      : ensure(equal-to(expected-vault-id   vault-output-id()));
      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-input-token : ${tokenA18.address} ,
      expected-output-token : ${tokenB06.address} ,

      : ensure(equal-to(expected-input-token context<3 0>())),
      : ensure(equal-to(expected-output-token  context<4 0>())),
      : ensure(equal-to(expected-input-token vault-input-token-address())),
      : ensure(equal-to(expected-output-token  vault-output-token-address())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-input-token : ${tokenA18.address} ,
      expected-output-token : ${tokenB06.address} ,

      : ensure(equal-to(expected-input-token context<3 0>())),
      : ensure(equal-to(expected-output-token  context<4 0>())),
      : ensure(equal-to(expected-input-token vault-input-token-address())),
      : ensure(equal-to(expected-output-token  vault-output-token-address()));
      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      expected-input-token-deciamls : ${tokenADecimals} ,
      expected-output-token-deciamls : ${tokenBDecimals} ,

      : ensure(equal-to(expected-input-token-deciamls context<3 1>())),
      : ensure(equal-to(expected-output-token-deciamls  context<4 1>())),
      : ensure(equal-to(expected-input-token-deciamls vault-input-token-decimals())),
      : ensure(equal-to(expected-output-token-deciamls  vault-output-token-decimals())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-input-token-deciamls : ${tokenADecimals} ,
      expected-output-token-deciamls : ${tokenBDecimals} ,

      : ensure(equal-to(expected-input-token-deciamls context<3 1>())),
      : ensure(equal-to(expected-output-token-deciamls  context<4 1>())),
      : ensure(equal-to(expected-input-token-deciamls vault-input-token-decimals())),
      : ensure(equal-to(expected-output-token-deciamls  vault-output-token-decimals()));
      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      compare-key : ${key1} ,
      input-token-key : ${key2} ,
      output-token-key : ${key3} , 

      :set(compare-key greater-than(vault-input-token-decimals() vault-output-token-decimals())) ,
      :set(input-token-key vault-input-token-decimals()) ,
      :set(output-token-key vault-output-token-decimals()) ,

      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */  
      compare-key : ${key1} ,
      input-token-key : ${key2} ,
      output-token-key : ${key3} , 

      expected-input-token-decimals : ${tokenADecimals} , 
      expected-output-token-decimals : ${tokenBDecimals} , 

      : ensure(equal-to(get(compare-key) 1)),
      : ensure(equal-to(get(input-token-key) expected-input-token-decimals)),
      : ensure(equal-to(get(output-token-key) expected-output-token-decimals));

      `
    );

    const EvaluableConfigAlice = await generateEvaluableConfig(
      sources,
      constants
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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // TAKE ORDER BOB

    const takeOrderConfigStructBob: TakeOrderConfigStruct = {
      order: Order_A,
      inputIOIndex: 0,
      outputIOIndex: 1,
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructBob);

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

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const INPUT_BALANCE_DIFF = () => op(Opcode.context, 0x0304);
    const OUTPUT_BALANCE_DIFF = () => op(Opcode.context, 0x0404);

    // ORDERS
    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const aip = minBN(amountB, minBN(max_uint256, amountB)); // minimum of remainingInput and outputMax
    const aop = fixedPointMul(aip, ratio_A);

    const aliceOrder = encodeMeta("aliceOrder");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */

      : ensure(equal-to(0 context<3 4>())),
      : ensure(equal-to(0  context<4 4>())),
      : ensure(equal-to(0 vault-input-balance-increase())),
      : ensure(equal-to(0  vault-output-balance-decrease())),


      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-input-diff : ${aip} ,
      expected-output-diff : ${aop} ,

      : ensure(equal-to(expected-output-diff context<3 4>())),
      : ensure(equal-to(expected-input-diff  context<4 4>())),
      : ensure(equal-to(expected-output-diff vault-input-balance-increase())),
      : ensure(equal-to(expected-input-diff  vault-output-balance-decrease()));
      `
    );

    const EvaluableConfig = await generateEvaluableConfig(sources, constants);

    const OrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig,
      meta: aliceOrder,
    };

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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
      signedContext: [],
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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(amountB), "wrong input");
    assert(output.eq(amountA), "wrong output");

    compareStructs(config, takeOrderConfigStruct);

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

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS
    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const amountB = ethers.BigNumber.from("2" + eighteenZeros);

    const aliceOrder = encodeMeta("aliceOrder");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      output-max : order-output-max(),
      ratio : order-io-ratio(),

      _: ${max_uint256},
      _: ${ratio_A};
      `
    );

    const EvaluableConfig = await generateEvaluableConfig(
      [sources[0], []],
      constants
    );

    const OrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig,
      meta: aliceOrder,
    };

    const txAddOrder = await orderBook.connect(alice).addOrder(OrderConfig);

    const { order: Order_A } = (await getEventArgs(
      txAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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
      signedContext: [],
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

  it("should sacle ratio according to decimal difference and scale outputMax to token deciamls and cap it to the vault balance of the owner", async function () {
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

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ORDERS

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio_A = ethers.BigNumber.from(10).pow(18);

    // We want the takeOrders max ratio to be exact, for the purposes of testing. We scale the original ratio 'up' by the difference between A decimals and B decimals.
    const maximumIORatio = fixedPointMul(
      ratio_A,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

    // Alice and Bob will each deposit 2 units of tokenB
    const depositAmountB = ethers.BigNumber.from(2 + sixZeros);

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* meta hash */
      @${opMetaHash}
      @${callerMetaHash} 

      /* CalculateIO source */
      _: ${max_uint256},
      _: ${ratio_A};
      
      /* HANDLE IO */ 
      expected-max-output : ${depositAmountB} ,
      expected-ratio : ${maximumIORatio} ,

      : ensure(equal-to(expected-max-output context<2 0>())),
      : ensure(equal-to(expected-ratio  context<2 1>())),
      : ensure(equal-to(expected-max-output order-output-max())),
      : ensure(equal-to(expected-ratio  order-io-ratio())); 
      `
    );

    const EvaluableConfig = await generateEvaluableConfig(sources, constants);

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
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfigAlice);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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
      signedContext: [],
    };

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

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(depositAmountB), "wrong input");
    assert(output.eq(depositAmountA), "wrong output");

    compareStructs(config, takeOrderConfigStructAlice);

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
