import { strict as assert } from "assert";

import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReserveToken18 } from "../../typechain";
import {
  AddOrderEvent,
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
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

import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { encodeMeta } from "../../utils/orderBook/order";

const Opcode = AllStandardOps;

describe("OrderBook counterparty in context", async function () {
  const cCounterparty = op(Opcode.context, 0x0102);

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

  it("should expose counterparty context to RainInterpreter calculations (e.g. Order_A will noop if Order_B counterparty does not match Carol's address)", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, carol, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const carolInputVault = ethers.BigNumber.from(randomUint256());
    const carolOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const outputMax_A = max_uint256;
    const outputMaxIfNotMatchingCounterparty_A = 0;

    const constants_A = [
      outputMax_A,
      outputMaxIfNotMatchingCounterparty_A,
      ratio_A,
      carol.address,
    ];
    const aOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const aOpMaxIfNotMatch = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const aRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const expectedCounterparty = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );

    // prettier-ignore
    const source_A = concat([
          cCounterparty,
          expectedCounterparty,
        op(Opcode.equal_to),
        aOpMax,
        aOpMaxIfNotMatch,
      op(Opcode.eager_if),
      aRatio,
    ]);
    const aliceOrder = encodeMeta("Order_A");

    const EvaluableConfig_A = await generateEvaluableConfig(
      [source_A, []],
      constants_A
    );

    const OrderConfig_A: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig_A,
      meta: aliceOrder,
    };

    const txOrder_A = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txOrder_A,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B - BAD MATCH

    const ratio_B = fixedPointDiv(ONE, ratio_A);
    const constants_B = [max_uint256, ratio_B];
    const bOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const bRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const source_B = concat([
      bOpMax,
      bRatio,
    ]);
    const bobOrder = encodeMeta("Order_B");
    const EvaluableConfig_B = await generateEvaluableConfig(
      [source_B, []],
      constants_B
    );
    const OrderConfig_B: OrderConfigStruct = {
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
      ],
      evaluableConfig: EvaluableConfig_B,
      meta: bobOrder,
    };

    const txOrder_B = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txOrder_B,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

    // Order_B - GOOD MATCH

    const ratio_C = fixedPointDiv(ONE, ratio_A);
    const constants_C = [max_uint256, ratio_C];
    const cOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const cRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const source_C = concat([
      cOpMax,
      cRatio,
    ]);
    const carolOrder = encodeMeta("Order_C");
    const EvaluableConfig_C = await generateEvaluableConfig(
      [source_C, []],
      constants_C
    );
    const OrderConfig_C: OrderConfigStruct = {
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: carolInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: carolOutputVault },
      ],
      evaluableConfig: EvaluableConfig_C,
      meta: carolOrder,
    };

    const txOrder_C = await orderBook.connect(carol).addOrder(OrderConfig_C);

    const { sender: sender_C, order: Order_C } = (await getEventArgs(
      txOrder_C,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_C === carol.address, "wrong sender");
    compareStructs(Order_C, OrderConfig_C);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);
    await tokenA.transfer(carol.address, amountA);

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
    const depositConfigStructCarol: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: carolOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);
    await tokenA
      .connect(carol)
      .approve(orderBook.address, depositConfigStructCarol.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);
    // Carol deposits tokenA into her output vault
    const txDepositOrderCarol = await orderBook
      .connect(carol)
      .deposit(depositConfigStructCarol);

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
    const { sender: depositCarolSender, config: depositCarolConfig } =
      (await getEventArgs(
        txDepositOrderCarol,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    compareStructs(depositBobConfig, depositConfigStructBob);
    assert(depositCarolSender === carol.address);
    compareStructs(depositCarolConfig, depositConfigStructCarol);

    // BOUNTY BOT CLEARS THE ORDER - BAD MATCH

    const clearConfig: ClearConfigStruct = {
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const badClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    const {
      sender: badClearSender,
      alice: badClearA_,
      bob: badClearB_,
      clearConfig: badClearBountyConfig,
    } = (await getEventArgs(
      badClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];

    const {
      sender: badAfterClearSender,
      clearStateChange: badClearStateChange,
    } = (await getEventArgs(
      badClearOrder,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const expectedBadClearStateChange: ClearStateChangeStruct = {
      aliceOutput: 0,
      bobOutput: 0,
      aliceInput: 0,
      bobInput: 0,
    };

    assert(badAfterClearSender === bountyBot.address);
    assert(badClearSender === bountyBot.address);
    compareSolStructs(badClearA_, Order_A);
    compareSolStructs(badClearB_, Order_B);
    compareStructs(badClearBountyConfig, clearConfig);
    compareStructs(badClearStateChange, expectedBadClearStateChange);

    // BOUNTY BOT CLEARS THE ORDER - GOOD MATCH

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_C, clearConfig, [], []);

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
    compareSolStructs(clearB_, Order_C);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);
  });
});
