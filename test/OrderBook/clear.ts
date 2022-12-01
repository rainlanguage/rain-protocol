import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
  ReserveTokenDecimals,
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
import { assertError } from "../../utils/test/assertError";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("OrderBook clear order", async function () {
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

  describe("should scale outputMax with decimals", () => {
    it("should scale outputMax based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
          {
            token: tokenA06.address,
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale outputMax based on input/output token decimals (input token has MORE decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        20,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA20.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
          {
            token: tokenA20.address,
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA20.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA20.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA20
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA20.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA20.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA20.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA20.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale outputMax based on input/output token decimals (input token has MORE decimals than output: 18 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA18.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA18.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA18.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA18.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA18
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA18.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA18.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA18.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA18.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        20,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB20.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB20.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB20
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB20.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB20.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB20.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB20.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB18.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB18.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        0,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

      const tokenADecimals = await tokenA00.decimals();
      const tokenBDecimals = await tokenB18.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);

      // note 18 decimals for outputMax
      // 3e18 means that only 3 units of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(3 + eighteenZeros);

      const askConstants = [askOutputMax, askRatio];
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
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB18.transfer(alice.address, amountB);
      await tokenA00.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA00.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA00
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA00.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA00.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA00.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA00.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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
      const bOutputMaxExpected = askOutputMax;

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });
  });

  describe("should scale ratio with decimals", () => {
    it("should scale ratio based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
          {
            token: tokenA06.address,
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        20,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA20.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
          {
            token: tokenA20.address,
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA20.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA20.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA20.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA20
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA20.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA20.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA20.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA20.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 18 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      await tokenA18.initialize();
      await tokenB06.initialize();

      const tokenADecimals = await tokenA18.decimals();
      const tokenBDecimals = await tokenB06.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB06.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA18.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB06.transfer(alice.address, amountB);
      await tokenA18.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA18.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA18
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA18.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA18.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA18.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA18.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB06.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        20,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB20.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB20.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB20.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB20
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB20.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB20.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB20.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB20.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        6,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

      const tokenADecimals = await tokenA06.decimals();
      const tokenBDecimals = await tokenB18.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA06.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB18.transfer(alice.address, amountB);
      await tokenA06.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA06.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        0,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        18,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

      const tokenADecimals = await tokenA00.decimals();
      const tokenBDecimals = await tokenB18.decimals();

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

      // note 18 decimals for ratio
      // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
      const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: aliceInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: aliceOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [askSource, []],
          constants: askConstants,
        },
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

      const bidRatio = fixedPointDiv(ONE, askRatio); // no need to account for decimals difference

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
          {
            token: tokenB18.address,
            decimals: tokenBDecimals,
            vaultId: bobInputVault,
          },
        ],
        validOutputs: [
          {
            token: tokenA00.address,
            decimals: tokenADecimals,
            vaultId: bobOutputVault,
          },
        ],
        interpreterStateConfig: {
          sources: [bidSource, []],
          constants: bidConstants,
        },
      };

      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);

      const { sender: bidSender, order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      assert(bidSender === bob.address, "wrong sender");
      compareStructs(bidOrder, bidOrderConfig);

      // DEPOSITS

      const amountB = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenBDecimals)
      );
      const amountA = ethers.BigNumber.from(
        "1000" + "0".repeat(tokenADecimals)
      );

      await tokenB18.transfer(alice.address, amountB);
      await tokenA00.transfer(bob.address, amountA);

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: amountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA00.address,
        vaultId: bobOutputVault,
        amount: amountA,
      };

      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA00
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);

      // Alice deposits tokenB18 into her output vault
      const txDepositOrderAlice = await orderBook
        .connect(alice)
        .deposit(depositConfigStructAlice);
      // Bob deposits tokenA06 into his output vault
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
        aInputIOIndex: 0,
        aOutputIOIndex: 0,
        bInputIOIndex: 0,
        bOutputIOIndex: 0,
        aBountyVaultId: bountyBotVaultA,
        bBountyVaultId: bountyBotVaultB,
      };

      // vault balances
      const vaultBalanceAliceA0 = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const vaultBalanceAliceB0 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA0 = await orderBook.vaultBalance(
        bob.address,
        tokenA00.address,
        bobOutputVault
      );
      const vaultBalanceBobB0 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA00.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB0 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      const txClearOrder = await orderBook
        .connect(bountyBot)
        .clear(askOrder, bidOrder, clearConfig);

      // vault balances
      const vaultBalanceAliceA1 = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const vaultBalanceAliceB1 = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const vaultBalanceBobA1 = await orderBook.vaultBalance(
        bob.address,
        tokenA00.address,
        bobOutputVault
      );
      const vaultBalanceBobB1 = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const vaultBalanceBountyBotA1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenA00.address,
        bountyBotVaultA
      );
      const vaultBalanceBountyBotB1 = await orderBook.vaultBalance(
        bountyBot.address,
        tokenB18.address,
        bountyBotVaultB
      );

      console.log({
        vaultBalanceAliceA0,
        vaultBalanceAliceA1,
        vaultBalanceAliceB0,
        vaultBalanceAliceB1,
        vaultBalanceBobA0,
        vaultBalanceBobA1,
        vaultBalanceBobB0,
        vaultBalanceBobB1,
        vaultBalanceBountyBotA0,
        vaultBalanceBountyBotA1,
        vaultBalanceBountyBotB0,
        vaultBalanceBountyBotB1,
      });

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

      console.log({ clearStateChange, expectedClearStateChange });

      assert(clearSender === bountyBot.address);
      compareSolStructs(clearA_, askOrder);
      compareSolStructs(clearB_, bidOrder);
      compareStructs(clearBountyConfig, clearConfig);
      compareStructs(clearStateChange, expectedClearStateChange);
    });
  });

  it("orders must be live to clear (order B)", async function () {
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

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
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

    // order B is removed
    await orderBook.connect(bob).removeOrder(bidOrder);

    // BOUNTY BOT CLEARS THE ORDER

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
          .clear(askOrder, bidOrder, clearConfig),
      "B_NOT_LIVE",
      "did not correctly remove order"
    );
  });

  it("orders must be live to clear (order A)", async function () {
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

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
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

    // order A is removed
    await orderBook.connect(alice).removeOrder(askOrder);

    // BOUNTY BOT CLEARS THE ORDER

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
          .clear(askOrder, bidOrder, clearConfig),
      "A_NOT_LIVE",
      "did not correctly remove order"
    );
  });

  it("should validate input/output tokens", async function () {
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

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
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
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    // Override bid config
    const bigConfigInvalid0 = {
      ...bidOrder,
      validOutputs: [
        {
          ...bidOrder.validOutputs[0],
          token: tokenB.address, // will result in mismatch
        },
      ],
    };
    const bigConfigInvalid1 = {
      ...bidOrder,
      validInputs: [
        {
          ...bidOrder.validInputs[0],
          token: tokenA.address, // will result in mismatch
        },
      ],
    };

    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(askOrder, bigConfigInvalid0, clearConfig),
      "TOKEN_MISMATCH",
      "did not validate output token"
    );
    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(askOrder, bigConfigInvalid1, clearConfig),
      "TOKEN_MISMATCH",
      "did not validate input token"
    );
  });

  it("should enforce different owner for ask and bid orders", async function () {
    const signers = await ethers.getSigners();

    const alice1 = signers[1];
    const alice2 = alice1; // 'Bob' is actually Alice in this case
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
      .connect(alice1)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askSender === alice1.address, "wrong sender");
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

    const txBidAddOrder = await orderBook
      .connect(alice2)
      .addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === alice2.address, "wrong sender");
    compareStructs(bidOrder, bidOrderConfig);

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice1.address, amountB);
    await tokenA.transfer(alice2.address, amountA);

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
      .connect(alice1)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(alice2)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice (alice1) deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice1)
      .deposit(depositConfigStructAlice);
    // Bob (alice2) deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(alice2)
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

    assert(depositAliceSender === alice1.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === alice2.address);
    compareStructs(depositBobConfig, depositConfigStructBob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = orderBook
      .connect(bountyBot)
      .clear(askOrder, bidOrder, clearConfig);

    await assertError(
      async () => await txClearOrder,
      "SAME_OWNER",
      "did not revert with same owner for ask and bid orders"
    );
  });

  it("should add ask and bid orders and clear the order", async function () {
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

    const { sender: bidSender, order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(bidSender === bob.address, "wrong sender");
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

    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, askOrder);
    compareSolStructs(clearB_, bidOrder);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);
  });
});
