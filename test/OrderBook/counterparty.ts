import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import type { ReserveToken18 } from "../../typechain";
import {
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  AddOrderEvent,
} from "../../typechain/contracts/orderbook/OrderBook";
import {
  eighteenZeros,
  max_uint256,
  max_uint32,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../utils/events";
import { fixedPointDiv, fixedPointMul, minBN } from "../../utils/math";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { assertError } from "../../utils/test/assertError";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("OrderBook counterparty in context", async function () {
  const cCounterparty = op(Opcode.CONTEXT, 0x0002);

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

  it("should expose counterparty context to RainInterpreter calculations (e.g. ask order will trigger revert if bid order counterparty does not match Carol's address)", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];
    const bountyBot = signers[4];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const carolInputVault = ethers.BigNumber.from(1);
    const carolOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askOutputMax = max_uint256;
    const askOutputMaxIfNotMatchingCounterparty = 0;

    const askConstants = [
      askOutputMax,
      askOutputMaxIfNotMatchingCounterparty,
      askPrice,
      carol.address,
    ];
    const vAskOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskOutputMaxIfNotMatch = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vAskPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vExpectedCounterparty = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 3)
    );

    // prettier-ignore
    const askSource = concat([
          cCounterparty,
          vExpectedCounterparty,
        op(Opcode.EQUAL_TO),
        vAskOutputMax,
        vAskOutputMaxIfNotMatch,
      op(Opcode.EAGER_IF),
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
      expiresAfter: max_uint32,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askConfig } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askSender === alice.address, "wrong sender");
    compareStructs(askConfig, askOrderConfig);

    // BID ORDER - BAD MATCH

    const bidPrice = fixedPointDiv(ONE, askPrice);
    const bidConstants = [max_uint256, bidPrice];
    const vBidOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vBidPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const bidSource = concat([
      vBidOutputMax,
      vBidPrice,
    ]);
    const bidOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenB.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenA.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [bidSource],
        constants: bidConstants,
      },
      expiresAfter: max_uint32,
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidConfig } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
    compareStructs(bidConfig, bidOrderConfig);

    // BID ORDER - GOOD MATCH

    const bidPriceCarol = fixedPointDiv(ONE, askPrice);
    const bidConstantsCarol = [max_uint256, bidPriceCarol];
    const vBidOutputMaxCarol = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vBidPriceCarol = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const bidSourceCarol = concat([
      vBidOutputMaxCarol,
      vBidPriceCarol,
    ]);
    const bidOrderConfigCarol: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenB.address, vaultId: carolInputVault }],
      validOutputs: [{ token: tokenA.address, vaultId: carolOutputVault }],
      interpreterStateConfig: {
        sources: [bidSourceCarol],
        constants: bidConstantsCarol,
      },
      expiresAfter: max_uint32,
    };

    const txBidAddOrderCarol = await orderBook
      .connect(carol)
      .addOrder(bidOrderConfigCarol);

    const { sender: bidSenderCarol, order: bidConfigCarol } =
      (await getEventArgs(
        txBidAddOrderCarol,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

    assert(bidSenderCarol === carol.address, "wrong sender");
    compareStructs(bidConfigCarol, bidOrderConfigCarol);

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
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(askConfig, bidConfig, clearConfig),
      "0_CLEAR",
      "should revert with 0 amount since bob does not match expected counterparty"
    );

    // BOUNTY BOT CLEARS THE ORDER - GOOD MATCH

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(askConfig, bidConfigCarol, clearConfig);

    const {
      sender: clearSender,
      a: clearA_,
      b: clearB_,
      clearConfig: clearBountyConfig,
    } = (await getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: clearStateChange } = (await getEventArgs(
      txClearOrder,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected = amountA;
    const bOutputMaxExpected = amountB;

    const aOutputExpected = minBN(
      aOutputMaxExpected,
      fixedPointMul(bidPrice, amountA)
    );
    const bOutputExpected = minBN(
      bOutputMaxExpected,
      fixedPointMul(askPrice, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: fixedPointMul(askPrice, aOutputExpected),
      bInput: fixedPointMul(bidPrice, bOutputExpected),
    };

    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, askConfig);
    compareSolStructs(clearB_, bidConfigCarol);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);
  });
});
