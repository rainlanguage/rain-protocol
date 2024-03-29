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
  OrderConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  ONE,
  sixteenZeros,
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
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import { encodeMeta } from "../../utils/orderBook/order";

const Opcode = AllStandardOps;

describe("OrderBook many-to-many", async function () {
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;
  let tokenC: ReserveToken18;
  let tokenD: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenC = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenD = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
    await tokenC.initialize();
    await tokenD.initialize();
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should support a 'slosh' many-to-many orders setup", async function () {
    const signers = await ethers.getSigners();

    const [, alice] = signers;

    const orderBook = await deployOrderBook();

    const vaultAlice = ethers.BigNumber.from(randomUint256());

    const threshold = ethers.BigNumber.from(102 + sixteenZeros); // 2%

    const constants = [max_uint256, threshold];

    const vMaxAmount = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThreshold = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const source = concat([
      vMaxAmount,
      vThreshold,
    ]);
    const aliceOrder = encodeMeta("aliceOrder");

    const evaluableConfig = await generateEvaluableConfig(
      [source, []],
      constants
    );

    const orderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenB.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenA.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenD.address, decimals: 18, vaultId: vaultAlice },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenB.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenC.address, decimals: 18, vaultId: vaultAlice },
        { token: tokenD.address, decimals: 18, vaultId: vaultAlice },
      ],
      evaluableConfig: evaluableConfig,
      meta: aliceOrder,
    };

    const _txAddOrder = await orderBook.connect(alice).addOrder(orderConfig);
  });

  it("should add many orders and clear the orders", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const constants_A = [max_uint256, ratio_A];
    const aOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const aRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const source_A = concat([
      aOpMax,
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
        { token: tokenC.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
        { token: tokenD.address, decimals: 18, vaultId: aliceOutputVault },
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

    // Order_B

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
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
        { token: tokenD.address, decimals: 18, vaultId: bobOutputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
        { token: tokenC.address, decimals: 18, vaultId: bobInputVault },
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

    // DEPOSITS

    const amount = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenA.transfer(bob.address, amount);
    await tokenB.transfer(alice.address, amount);
    await tokenC.transfer(bob.address, amount);
    await tokenD.transfer(alice.address, amount);

    const depositConfigStructBobA: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: bobInputVault,
      amount,
    };
    const depositConfigStructAliceB: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount,
    };
    const depositConfigStructBobC: DepositConfigStruct = {
      token: tokenC.address,
      vaultId: bobInputVault,
      amount,
    };
    const depositConfigStructAliceD: DepositConfigStruct = {
      token: tokenD.address,
      vaultId: aliceOutputVault,
      amount,
    };

    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBobA.amount);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceB.amount);
    await tokenC
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBobC.amount);
    await tokenD
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceD.amount);

    // Alice deposits tokens into her output vault
    const _txDepositOrderAliceB = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAliceB);
    const _txDepositOrderAliceD = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAliceD);

    // Bob deposits tokens into his output vault
    const _txDepositOrderBobA = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBobA);
    const _txDepositOrderBobC = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBobC);

    // BOUNTY BOT CLEARS THE ORDERS

    const clearConfig0: ClearConfigStruct = {
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig0, [], []);

    const {
      sender: clearSender0,
      alice: clearA_,
      bob: clearB_,
      clearConfig: clearBountyConfig0,
    } = (await getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender0, clearStateChange: clearStateChange0 } =
      (await getEventArgs(
        txClearOrder0,
        "AfterClear",
        orderBook
      )) as AfterClearEvent["args"];

    const aOutputMaxExpected0 = amount;
    const bOutputMaxExpected0 = amount;

    const aOutputExpected0 = minBN(
      aOutputMaxExpected0,
      fixedPointMul(ratio_B, amount)
    );
    const bOutputExpected0 = minBN(
      bOutputMaxExpected0,
      fixedPointMul(ratio_A, amount)
    );

    const expectedClearStateChange0: ClearStateChangeStruct = {
      aliceOutput: aOutputExpected0,
      bobOutput: bOutputExpected0,
      aliceInput: fixedPointMul(ratio_A, aOutputExpected0),
      bobInput: fixedPointMul(ratio_B, bOutputExpected0),
    };

    assert(afterClearSender0 === bountyBot.address);
    assert(clearSender0 === bountyBot.address);
    compareSolStructs(clearA_, Order_A);
    compareSolStructs(clearB_, Order_B);
    compareStructs(clearBountyConfig0, clearConfig0);
    compareStructs(clearStateChange0, expectedClearStateChange0);

    const clearConfig1: ClearConfigStruct = {
      aliceInputIOIndex: 1,
      aliceOutputIOIndex: 1,
      bobInputIOIndex: 1,
      bobOutputIOIndex: 1,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig1, [], []);

    const {
      sender: clearSender1,
      alice: clearC_,
      bob: clearD_,
      clearConfig: clearBountyConfig1,
    } = (await getEventArgs(
      txClearOrder1,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender1, clearStateChange: clearStateChange1 } =
      (await getEventArgs(
        txClearOrder1,
        "AfterClear",
        orderBook
      )) as AfterClearEvent["args"];

    const cOutputMaxExpected1 = amount;
    const dOutputMaxExpected1 = amount;

    const cOutputExpected1 = minBN(
      cOutputMaxExpected1,
      fixedPointMul(ratio_B, amount)
    );
    const dOutputExpected1 = minBN(
      dOutputMaxExpected1,
      fixedPointMul(ratio_A, amount)
    );

    const expectedClearStateChange1: ClearStateChangeStruct = {
      aliceOutput: cOutputExpected1,
      bobOutput: dOutputExpected1,
      aliceInput: fixedPointMul(ratio_A, cOutputExpected1),
      bobInput: fixedPointMul(ratio_B, dOutputExpected1),
    };

    assert(afterClearSender1 === bountyBot.address);
    assert(clearSender1 === bountyBot.address);
    compareSolStructs(clearC_, Order_A);
    compareSolStructs(clearD_, Order_B);
    compareStructs(clearBountyConfig1, clearConfig1);
    compareStructs(clearStateChange1, expectedClearStateChange1);
  });

  it("should add many-to-many orders", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob] = signers;

    const orderBook = await deployOrderBook();

    const aliceVaultA = ethers.BigNumber.from(randomUint256());
    const aliceVaultB = ethers.BigNumber.from(randomUint256());
    const bobVaultB = ethers.BigNumber.from(randomUint256());
    const bobVaultA = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const constants_A = [max_uint256, ratio_A];
    const aOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const aRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const source_A = concat([
      aOpMax,
      aRatio,
    ]);
    const aliceOrder = encodeMeta("Order_A");

    const EvaluableConfig_A = await generateEvaluableConfig(
      [source_A, []],
      constants_A
    );

    const OrderConfig_A: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceVaultA },
        { token: tokenB.address, decimals: 18, vaultId: aliceVaultB },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceVaultB },
        { token: tokenA.address, decimals: 18, vaultId: aliceVaultA },
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

    // Order_B

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
        { token: tokenB.address, decimals: 18, vaultId: bobVaultB },
        { token: tokenA.address, decimals: 18, vaultId: bobVaultA },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobVaultA },
        { token: tokenB.address, decimals: 18, vaultId: bobVaultB },
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
  });
});
