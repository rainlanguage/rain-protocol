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
  DepositEvent,
  OrderConfigStruct,
  WithdrawConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
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

describe("OrderBook bounty", async function () {
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

  it("order clearer should receive correct bounty amounts in their vaults, and can withdraw their vault balance for each token", async function () {
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
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: _askSender, order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(_askSender === alice.address, "wrong sender");
    compareStructs(askOrder, askOrderConfig);

    // BID ORDER

    // bob undervalues his units, offering better value than alice expects
    // order clearer is ultimately rewarded with this difference as a bounty
    // i.e. an excess of tokenA which bob didn't need to give to alice to
    // fulfill her bid order
    const bidRatio = fixedPointDiv(ONE, askRatio.add(10 + eighteenZeros));
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
    const bidOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: _bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(_bidSender === bob.address, "wrong sender");
    compareStructs(bidOrder, bidOrderConfig);

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

    const { sender: _depositAliceSender, config: _depositAliceConfig } =
      (await getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: _depositBobSender, config: _depositBobConfig } =
      (await getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(_depositAliceSender === alice.address);
    compareStructs(_depositAliceConfig, depositConfigStructAlice);
    assert(_depositBobSender === bob.address);
    compareStructs(_depositBobConfig, depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(askOrder, bidOrder, clearConfig);

    const {
      sender: _clearSender,
      a: clearA_,
      b: clearB_,
      clearConfig: _clearBountyConfig,
    } = (await getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { stateChange: _clearStateChange } = (await getEventArgs(
      txClearOrder,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const aOutputMaxExpected = amountA;
    const bOutputMaxExpected = amountB;

    const aOutputExpected = minBN(
      aOutputMaxExpected,
      fixedPointMul(bidRatio, amountA)
    );
    const bOutputExpected = minBN(
      bOutputMaxExpected,
      fixedPointMul(askRatio, amountB)
    );

    const expectedClearStateChange: ClearStateChangeStruct = {
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: fixedPointMul(askRatio, aOutputExpected),
      bInput: fixedPointMul(bidRatio, bOutputExpected),
    };

    assert(_clearSender === bountyBot.address);
    compareSolStructs(clearA_, askOrder);
    compareSolStructs(clearB_, bidOrder);
    compareStructs(_clearBountyConfig, clearConfig);
    compareStructs(_clearStateChange, expectedClearStateChange);

    const _actualBounty = {
      a: _clearStateChange.aOutput.sub(_clearStateChange.bInput),
      b: _clearStateChange.bOutput.sub(_clearStateChange.aInput),
    };

    // alice pays 90% of input amount to bob and 10% to order clearer to make
    // up the difference
    assert(_actualBounty.b.eq(amountB.div(10)));

    const _vaultBalance0 = await orderBook.vaultBalance(
      bountyBot.address,
      tokenA.address,
      bountyBotVaultB
    );
    assert(_actualBounty.b.eq(_vaultBalance0));

    const withdrawConfigStruct: WithdrawConfigStruct = {
      token: tokenA.address,
      vaultId: bountyBotVaultB,
      amount: _vaultBalance0,
    };

    const _clearerBalance0 = await tokenA.balanceOf(bountyBot.address);

    // order clearer withdraws bounty from vault
    await orderBook.connect(bountyBot).withdraw(withdrawConfigStruct);

    const _clearerBalance1 = await tokenA.balanceOf(bountyBot.address);

    assert(_clearerBalance0.isZero());
    assert(_clearerBalance1.eq(_vaultBalance0));

    const _vaultBalance1 = await orderBook.vaultBalance(
      bountyBot.address,
      tokenA.address,
      bountyBotVaultB
    );
    assert(_vaultBalance1.isZero());
  });
});
