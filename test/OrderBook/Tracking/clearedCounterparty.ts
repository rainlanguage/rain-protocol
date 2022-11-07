import { assert } from "chai";
import { BigNumber, ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../../typechain";
import {
  AfterClearEvent,
  ClearConfigStruct,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  OrderLiveEvent,
  WithdrawConfigStruct,
} from "../../../typechain/contracts/orderbook/OrderBook";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  Debug,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { fixedPointDiv } from "../../../utils/math";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe.only("OrderBook tracking counterparty funds cleared", async function () {
  const cOrderHash = op(Opcode.CONTEXT, 0x0000);
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

  it.only("should record cleared counterparty funds", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bountyBot = signers[3];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);
    const bobInputVault = ethers.BigNumber.from(1);
    const bobOutputVault = ethers.BigNumber.from(2);
    const bountyBotVaultA = ethers.BigNumber.from(1);
    const bountyBotVaultB = ethers.BigNumber.from(2);

    // ASK ORDER

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askPrice];
    const vAskOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
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
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askConfig, orderHash: askOrderHash_ } = (await getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    // BID ORDER

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
    };

    const txBidOrderLive = await orderBook
      .connect(bob)
      .addOrder(bidOrderConfig);

    const { order: bidConfig } = (await getEventArgs(
      txBidOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

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
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    await orderBook.connect(bob).deposit(depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    await orderBook.connect(bountyBot).clear(askConfig, bidConfig, clearConfig);

    const clearedCounterpartyValue_ = await orderBook.clearedCounterparty(
      askOrderHash_,
      bob.address
    );

    const expectedClearedCounterpartyValue_ =
      depositConfigStructAlice.amount as BigNumber;

    assert(
      clearedCounterpartyValue_.eq(expectedClearedCounterpartyValue_),
      `wrong cleared counterparty value
      expected  ${expectedClearedCounterpartyValue_}
      got       ${clearedCounterpartyValue_}`
    );
  });

  it("should expose tracked data to RainInterpreter calculations (e.g. asker throttles output of their tokens to 5 tokens per block per bidder)", async function () {
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
    const askBlock = await ethers.provider.getBlockNumber();

    const askConstants = [askPrice, askBlock, 5];
    const vAskPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vAskBlock = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const v5 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    // prettier-ignore
    const askSource = concat([
      cOrderHash,
      cCounterparty,

        op(Opcode.CALLER),
        cOrderHash,
        cCounterparty,
      op(Opcode.IORDERBOOKV1_CLEARED_COUNTERPARTY),

            op(Opcode.BLOCK_NUMBER),
            vAskBlock,
          op(Opcode.SUB, 2),
          v5,
        op(Opcode.MUL, 2),
          op(Opcode.CALLER),
          cOrderHash,
          cCounterparty,
        op(Opcode.IORDERBOOKV1_CLEARED_COUNTERPARTY),
      op(Opcode.SUB, 2),

      op(Opcode.DEBUG, Debug.StatePacked),

      // outputMax = (currentBlock - askBlock) * 5 - bidderCleared
      // 5 tokens available per block
            op(Opcode.BLOCK_NUMBER),
            vAskBlock,
          op(Opcode.SUB, 2),
          v5,
        op(Opcode.MUL, 2),
          op(Opcode.CALLER),
          cOrderHash,
          cCounterparty,
        op(Opcode.IORDERBOOKV1_CLEARED_COUNTERPARTY),
      op(Opcode.SUB, 2),
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
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender_, order: askOrder_ } = (await getEventArgs(
      txAskOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(askSender_ === alice.address, "wrong sender");
    assert(askOrder_.owner === askSender_, "wrong owner");
    assert(
      askOrder_.expression.length === 42,
      "wrong expression address length"
    );
    askOrderConfig.validInputs.forEach((validInput, i_) => {
      assert(
        validInput.token === askOrder_.validInputs[i_].token,
        "invalid input token"
      );
      assert(
        (validInput.vaultId as BigNumber).eq(askOrder_.validInputs[i_].vaultId),
        "invalid input vaultId"
      );
    });
    askOrderConfig.validOutputs.forEach((validOutput, i_) => {
      assert(
        validOutput.token === askOrder_.validOutputs[i_].token,
        "invalid output token"
      );
      assert(
        (validOutput.vaultId as BigNumber).eq(
          askOrder_.validOutputs[i_].vaultId
        ),
        "invalid output vaultId"
      );
    });

    // BID ORDER - BOB

    const bobOutputMax = max_uint256;
    const bobPrice = fixedPointDiv(ONE, askPrice);
    const bobConstants = [bobOutputMax, bobPrice];
    const vBobOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vBobPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const bobSource = concat([
      vBobOutputMax,
      vBobPrice,
    ]);
    const bobOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenB.address, vaultId: bobInputVault }],
      validOutputs: [{ token: tokenA.address, vaultId: bobOutputVault }],
      interpreterStateConfig: {
        sources: [bobSource],
        constants: bobConstants,
      },
    };

    const txBobOrderLive = await orderBook
      .connect(bob)
      .addOrder(bobOrderConfig);

    const { sender: bobSender_, order: bobOrder_ } = (await getEventArgs(
      txBobOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(bobSender_ === bob.address, "wrong sender");
    assert(bobOrder_.owner === bobSender_, "wrong owner");
    assert(
      bobOrder_.expression.length === 42,
      "wrong expression address length"
    );
    bobOrderConfig.validInputs.forEach((validInput, i_) => {
      assert(
        validInput.token === bobOrder_.validInputs[i_].token,
        "invalid input token"
      );
      assert(
        (validInput.vaultId as BigNumber).eq(bobOrder_.validInputs[i_].vaultId),
        "invalid input vaultId"
      );
    });
    bobOrderConfig.validOutputs.forEach((validOutput, i_) => {
      assert(
        validOutput.token === bobOrder_.validOutputs[i_].token,
        "invalid output token"
      );
      assert(
        (validOutput.vaultId as BigNumber).eq(
          bobOrder_.validOutputs[i_].vaultId
        ),
        "invalid output vaultId"
      );
    });

    // BID ORDER - CAROL

    const carolOutputMax = max_uint256;
    const carolPrice = fixedPointDiv(ONE, askPrice);
    const carolConstants = [carolOutputMax, carolPrice];
    const vCarolOutputMax = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vCarolPrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const carolSource = concat([
      vCarolOutputMax,
      vCarolPrice,
    ]);
    const carolOrderConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [{ token: tokenB.address, vaultId: carolInputVault }],
      validOutputs: [{ token: tokenA.address, vaultId: carolOutputVault }],
      interpreterStateConfig: {
        sources: [carolSource],
        constants: carolConstants,
      },
    };

    const txCarolOrderLive = await orderBook
      .connect(carol)
      .addOrder(carolOrderConfig);

    const { sender: carolSender_, order: carolOrder_ } = (await getEventArgs(
      txCarolOrderLive,
      "OrderLive",
      orderBook
    )) as OrderLiveEvent["args"];

    assert(carolSender_ === carol.address, "wrong sender");
    assert(carolOrder_.owner === carolSender_, "wrong owner");
    assert(
      carolOrder_.expression.length === 42,
      "wrong expression address length"
    );
    carolOrderConfig.validInputs.forEach((validInput, i_) => {
      assert(
        validInput.token === carolOrder_.validInputs[i_].token,
        "invalid input token"
      );
      assert(
        (validInput.vaultId as BigNumber).eq(
          carolOrder_.validInputs[i_].vaultId
        ),
        "invalid input vaultId"
      );
    });
    carolOrderConfig.validOutputs.forEach((validOutput, i_) => {
      assert(
        validOutput.token === carolOrder_.validOutputs[i_].token,
        "invalid output token"
      );
      assert(
        (validOutput.vaultId as BigNumber).eq(
          carolOrder_.validOutputs[i_].vaultId
        ),
        "invalid output vaultId"
      );
    });

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

    // BOUNTY BOT CLEARS THE ORDERS

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const blockClear0 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty0 = { a: 1, b: 0 };
    const expectedOutputAmount0 =
      (blockClear0 - askBlock) * 5 - expectedBounty0.a;

    const txClearOrder0 = await orderBook
      .connect(bountyBot)
      .clear(askOrder_, bobOrder_, clearConfig);
    const { stateChange: stateChange0 } = (await getEventArgs(
      txClearOrder0,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const { bInput: bInput0 } = stateChange0;

    const _actualBounty0 = {
      a: stateChange0.aOutput.sub(stateChange0.bInput),
      b: stateChange0.bOutput.sub(stateChange0.aInput),
    };

    assert(
      bInput0.eq(expectedOutputAmount0),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount0}
      got       ${bInput0}`
    );

    const withdrawConfig0: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput0,
    };
    const bobTokenBBalance0 = await tokenB.balanceOf(bob.address);
    await orderBook.connect(bob).withdraw(withdrawConfig0);
    const bobTokenBBalance1 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance0.isZero());
    assert(bobTokenBBalance1.eq(bInput0));

    // clear Bob order again
    const blockClear1 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty1 = { a: 1, b: 0 };
    const expectedOutputAmount1 =
      (blockClear1 - askBlock) * 5 -
      expectedBounty1.a -
      expectedOutputAmount0 -
      expectedBounty0.a;

    const txClearOrder1 = await orderBook
      .connect(bountyBot)
      .clear(askOrder_, bobOrder_, clearConfig);
    const { stateChange: stateChange1 } = (await getEventArgs(
      txClearOrder1,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const { bInput: bInput1 } = stateChange1;

    const _actualBounty1 = {
      a: stateChange1.aOutput.sub(stateChange1.bInput),
      b: stateChange1.bOutput.sub(stateChange1.aInput),
    };

    assert(
      bInput1.eq(expectedOutputAmount1),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount1}
      got       ${bInput1}`
    );

    const withdrawConfig1: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput1,
    };
    await orderBook.connect(bob).withdraw(withdrawConfig1);
    const bobTokenBBalance2 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance2.eq(bobTokenBBalance1.add(bInput1)));

    // Carol should receive full amount, should be independent of amount Bob received
    const blockClear2 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty2 = { a: 1, b: 0 };
    const expectedOutputAmount2 =
      (blockClear2 - askBlock) * 5 - expectedBounty2.a;

    const txClearOrder2 = await orderBook
      .connect(bountyBot)
      .clear(askOrder_, carolOrder_, clearConfig);
    const { stateChange: stateChange2 } = (await getEventArgs(
      txClearOrder2,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const { bInput: bInput2 } = stateChange2;

    const _actualBounty2 = {
      a: stateChange2.aOutput.sub(stateChange2.bInput),
      b: stateChange2.bOutput.sub(stateChange2.aInput),
    };

    assert(
      bInput2.eq(expectedOutputAmount2),
      `did not throttle Carol bidder input amount correctly
      expected  ${expectedOutputAmount2}
      got       ${bInput2}`
    );

    const withdrawConfig2: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: carolInputVault,
      amount: bInput2,
    };
    const carolTokenBBalance0 = await tokenB.balanceOf(carol.address);
    await orderBook.connect(carol).withdraw(withdrawConfig2);
    const carolTokenBBalance1 = await tokenB.balanceOf(carol.address);
    assert(carolTokenBBalance0.isZero());
    assert(carolTokenBBalance1.eq(bInput2));

    // clear Carol order again
    const blockClear3 = (await ethers.provider.getBlockNumber()) + 1;
    const expectedBounty3 = { a: 1, b: 0 };
    const expectedOutputAmount3 =
      (blockClear3 - askBlock) * 5 -
      expectedBounty3.a -
      expectedOutputAmount2 -
      expectedBounty2.a;

    const txClearOrder3 = await orderBook
      .connect(bountyBot)
      .clear(askOrder_, carolOrder_, clearConfig);
    const { stateChange: stateChange3 } = (await getEventArgs(
      txClearOrder3,
      "AfterClear",
      orderBook
    )) as AfterClearEvent["args"];

    const { bInput: bInput3 } = stateChange3;

    const _actualBounty3 = {
      a: stateChange3.aOutput.sub(stateChange3.bInput),
      b: stateChange3.bOutput.sub(stateChange3.aInput),
    };

    assert(
      bInput3.eq(expectedOutputAmount3),
      `did not throttle bidder input amount correctly
      expected  ${expectedOutputAmount3}
      got       ${bInput3}`
    );

    const withdrawConfig3: WithdrawConfigStruct = {
      token: tokenB.address,
      vaultId: bobInputVault,
      amount: bInput3,
    };
    await orderBook.connect(bob).withdraw(withdrawConfig3);
    const bobTokenBBalance4 = await tokenB.balanceOf(bob.address);
    assert(bobTokenBBalance4.eq(bobTokenBBalance1.add(bInput3)));
  });
});
