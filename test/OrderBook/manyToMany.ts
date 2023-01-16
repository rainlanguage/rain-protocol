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
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
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

describe("OrderBook many-to-many", async function () {
  let orderBookFactory: ContractFactory;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;
  let tokenC: ReserveToken18;
  let tokenD: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

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
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  it("should support a 'slosh' many-to-many orders setup", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const vaultAlice = ethers.BigNumber.from(randomUint256());

    const threshold = ethers.BigNumber.from(102 + sixteenZeros); // 2%

    const constants = [max_uint256, threshold];

    const vMaxAmount = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThreshold = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const source = concat([
      vMaxAmount,
      vThreshold,
    ]);
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

    const orderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
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
      interpreterStateConfig: {
        sources: [source, []],
        constants: constants,
      },
      data: aliceAskOrder,
    };

    const _txAddOrder = await orderBook.connect(alice).addOrder(orderConfig);
  });

  it("should add many ask and bid orders and clear the orders", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

    const askOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
        { token: tokenC.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
        { token: tokenD.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data: aliceAskOrder,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    compareStructs(askOrder, askOrderConfig);

    // BID ORDER

    const bidRatio = fixedPointDiv(ONE, askRatio);
    const bidConstants = [max_uint256, bidRatio];
    const vBidOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vBidRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidRatio,
    ]);
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder");

    const bidOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobOutputVault },
        { token: tokenD.address, decimals: 18, vaultId: bobOutputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobInputVault },
        { token: tokenC.address, decimals: 18, vaultId: bobInputVault },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
      data: bobBidOrder,
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bidOrder, bidOrderConfig);

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
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askOrder, bidOrder, clearConfig0);

    const {
      sender: clearSender0,
      a: clearA_,
      b: clearB_,
      clearConfig: clearBountyConfig0,
    } = (await getEventArgs(
      txClearOrder0,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender0, clearStateChange: clearStateChange0 } = (await getEventArgs(
      txClearOrder0,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected0 = amount;
    const bOutputMaxExpected0 = amount;

    const aOutputExpected0 = minBN(
      aOutputMaxExpected0,
      fixedPointMul(bidRatio, amount)
    );
    const bOutputExpected0 = minBN(
      bOutputMaxExpected0,
      fixedPointMul(askRatio, amount)
    );

    const expectedClearStateChange0: ClearStateChangeStruct = {
      aOutput: aOutputExpected0,
      bOutput: bOutputExpected0,
      aInput: fixedPointMul(askRatio, aOutputExpected0),
      bInput: fixedPointMul(bidRatio, bOutputExpected0),
    };

    assert(afterClearSender0 === bountyBot.address);
    assert(clearSender0 === bountyBot.address);
    compareSolStructs(clearA_, askOrder);
    compareSolStructs(clearB_, bidOrder);
    compareStructs(clearBountyConfig0, clearConfig0);
    compareStructs(clearStateChange0, expectedClearStateChange0);

    const clearConfig1: ClearConfigStruct = {
      aInputIOIndex: 1,
      aOutputIOIndex: 1,
      bInputIOIndex: 1,
      bOutputIOIndex: 1,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };
    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askOrder, bidOrder, clearConfig1);

    const {
      sender: clearSender1,
      a: clearC_,
      b: clearD_,
      clearConfig: clearBountyConfig1,
    } = (await getEventArgs(
      txClearOrder1,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender1 ,clearStateChange: clearStateChange1 } = (await getEventArgs(
      txClearOrder1,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const cOutputMaxExpected1 = amount;
    const dOutputMaxExpected1 = amount;

    const cOutputExpected1 = minBN(
      cOutputMaxExpected1,
      fixedPointMul(bidRatio, amount)
    );
    const dOutputExpected1 = minBN(
      dOutputMaxExpected1,
      fixedPointMul(askRatio, amount)
    );

    const expectedClearStateChange1: ClearStateChangeStruct = {
      aOutput: cOutputExpected1,
      bOutput: dOutputExpected1,
      aInput: fixedPointMul(askRatio, cOutputExpected1),
      bInput: fixedPointMul(bidRatio, dOutputExpected1),
    };

    assert(afterClearSender1 === bountyBot.address);
    assert(clearSender1 === bountyBot.address);
    compareSolStructs(clearC_, askOrder);
    compareSolStructs(clearD_, bidOrder);
    compareStructs(clearBountyConfig1, clearConfig1);
    compareStructs(clearStateChange1, expectedClearStateChange1);
  });

  it("should add many-to-many orders", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceVaultA = ethers.BigNumber.from(randomUint256());
    const aliceVaultB = ethers.BigNumber.from(randomUint256());
    const bobVaultB = ethers.BigNumber.from(randomUint256());
    const bobVaultA = ethers.BigNumber.from(randomUint256());

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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

    const askOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceVaultA },
        { token: tokenB.address, decimals: 18, vaultId: aliceVaultB },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceVaultB },
        { token: tokenA.address, decimals: 18, vaultId: aliceVaultA },
      ],
      interpreterStateConfig: {
        sources: [askSource, []],
        constants: askConstants,
      },
      data: aliceAskOrder,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    compareStructs(askOrder, askOrderConfig);

    // BID ORDER

    const bidRatio = fixedPointDiv(ONE, askRatio);
    const bidConstants = [max_uint256, bidRatio];
    const vBidOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vBidRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidRatio,
    ]);
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder");

    const bidOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobVaultB },
        { token: tokenA.address, decimals: 18, vaultId: bobVaultA },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobVaultA },
        { token: tokenB.address, decimals: 18, vaultId: bobVaultB },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
      data: bobBidOrder,
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bidOrder, bidOrderConfig);
  });
});
