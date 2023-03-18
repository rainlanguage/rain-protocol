import { assert } from "chai";
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
  WithdrawConfigStruct,
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

const Opcode = AllStandardOps;

describe("OrderBook bounty", async function () {
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

  it("order clearer should receive correct bounty amounts in their vaults, and can withdraw their vault balance for each token", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

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

    const EvaluableConfig_A = await generateEvaluableConfig(
      [source_A, []],
      constants_A
    );

    const orderConfig_A: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig_A,
      data: aliceOrder,
    };

    const txOrder_A = await orderBook.connect(alice).addOrder(orderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txOrder_A,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, orderConfig_A);

    // Order_B

    // bob undervalues his units, offering better value than alice expects
    // order clearer is ultimately rewarded with this difference as a bounty
    // i.e. an excess of tokenA which bob didn't need to give to alice to
    // fulfill her bid order
    const ratio_B = fixedPointDiv(ONE, ratio_A.add(10 + eighteenZeros));
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
    const bidSource = concat([
      bOpMax,
      bRatio,
    ]);

    const bobOrder = ethers.utils.toUtf8Bytes("Order_B");

    const EvaluableConfig_B = await generateEvaluableConfig(
      [bidSource, []],
      constants_B
    );

    const orderConfig_B: OrderConfigStruct = {
      validInputs: [
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
      ],
      evaluableConfig: EvaluableConfig_B,
      data: bobOrder,
    };

    const txOrder_B = await orderBook.connect(bob).addOrder(orderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txOrder_B,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, orderConfig_B);

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
      .clear(Order_A, Order_B, clearConfig,[],[]);

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
    const { sender: _afterClearSender, clearStateChange: _clearStateChange } =
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
      aOutput: aOutputExpected,
      bOutput: bOutputExpected,
      aInput: fixedPointMul(ratio_A, aOutputExpected),
      bInput: fixedPointMul(ratio_B, bOutputExpected),
    };

    assert(_afterClearSender === bountyBot.address);
    assert(_clearSender === bountyBot.address);
    compareSolStructs(clearA_, Order_A);
    compareSolStructs(clearB_, Order_B);
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
