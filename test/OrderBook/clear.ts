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
import { OrderNotFoundEvent } from "../../typechain/contracts/orderbook/IOrderBookV1";
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
  sixZeros,
  twentyZeros,
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
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  describe("should scale outputMax with decimals", () => {
    it("should scale outputMax based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 6;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has MORE decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 20;
      const tokenBDecimals = 6;

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA20.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA20.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA20
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA20.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has MORE decimals than output: 18 vs 6)", async function () {
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
      const bountyBot = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // ASK ORDER

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA18.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA18.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA18
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB06.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA18.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 20;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + twentyZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB20.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB20
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB20.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 18;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA06.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });

    it("should scale outputMax based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 0;
      const tokenBDecimals = 18;

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const askOutputMax = ethers.BigNumber.from(1 + eighteenZeros);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA00.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenA00.transfer(bob.address, depositAmountA);
      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA00
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const aliceOutputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenB18.address,
        aliceOutputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );
      const bobOutputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenA00.address,
        bobOutputVault
      );

      // transferred during clear
      assert(aliceInputVaultBalance.eq(depositAmountA.div(2)));
      assert(bobInputVaultBalance.eq(depositAmountB.div(2)));

      // never moved after being deposited
      assert(aliceOutputVaultBalance.eq(depositAmountB.div(2)));
      assert(bobOutputVaultBalance.eq(depositAmountA.div(2)));
    });
  });

  describe("should scale ratio with decimals", () => {
    it("should scale ratio based on input/output token decimals (input token has SAME decimals as output: 6 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 6;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB06.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 20 vs 6)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 20;
      const tokenBDecimals = 6;

      const tokenA20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA20.initialize();
      await tokenB06.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA20.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA20.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA20
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA20.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
    });

    it("should scale ratio based on input/output token decimals (input token has MORE decimals than output: 18 vs 6)", async function () {
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
      const bountyBot = signers[3];

      const orderBook = (await orderBookFactory.deploy()) as OrderBook;

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // ASK ORDER

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + sixZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB06.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA18.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB06.transfer(alice.address, depositAmountB);
      await tokenA18.transfer(bob.address, depositAmountA);
      await tokenB06
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA18
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA18.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB06.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 20)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 20;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB20 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB20.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + twentyZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB20.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB20.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB20
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      // const aliceInputVaultBalance = await orderBook.vaultBalance(
      //   alice.address,
      //   tokenA06.address,
      //   aliceInputVault
      // );
      // const bobInputVaultBalance = await orderBook.vaultBalance(
      //   bob.address,
      //   tokenB20.address,
      //   bobInputVault
      // );

      // assert(aliceInputVaultBalance.eq(depositAmountA));
      // assert(bobInputVaultBalance.eq(depositAmountB));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 6 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 6;
      const tokenBDecimals = 18;

      const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA06.initialize();
      await tokenB18.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA06.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenA06.transfer(bob.address, depositAmountA);
      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA06
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
    });

    it("should scale ratio based on input/output token decimals (input token has LESS decimals than output: 0 vs 18)", async function () {
      const signers = await ethers.getSigners();

      const tokenADecimals = 0;
      const tokenBDecimals = 18;

      const tokenA00 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenADecimals,
      ])) as ReserveTokenDecimals;
      const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
        tokenBDecimals,
      ])) as ReserveTokenDecimals;
      await tokenA00.initialize();
      await tokenB18.initialize();

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

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const askRatio = ethers.BigNumber.from(10).pow(18);
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
        data: [],
      };
      const txAskAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(askOrderConfig);
      const { order: askOrder } = (await getEventArgs(
        txAskAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

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
        data: [],
      };
      const txBidAddOrder = await orderBook
        .connect(bob)
        .addOrder(bidOrderConfig);
      const { order: bidOrder } = (await getEventArgs(
        txBidAddOrder,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // DEPOSITS

      const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);
      const depositAmountA = fixedPointMul(
        depositAmountB,
        ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
      );

      const depositConfigStructAlice: DepositConfigStruct = {
        token: tokenB18.address,
        vaultId: aliceOutputVault,
        amount: depositAmountB,
      };
      const depositConfigStructBob: DepositConfigStruct = {
        token: tokenA00.address,
        vaultId: bobOutputVault,
        amount: depositAmountA,
      };
      await tokenB18.transfer(alice.address, depositAmountB);
      await tokenA00.transfer(bob.address, depositAmountA);
      await tokenB18
        .connect(alice)
        .approve(orderBook.address, depositConfigStructAlice.amount);
      await tokenA00
        .connect(bob)
        .approve(orderBook.address, depositConfigStructBob.amount);
      // Alice deposits tokenB18 into her output vault
      await orderBook.connect(alice).deposit(depositConfigStructAlice);
      // Bob deposits tokenA00 into his output vault
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

      await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA00.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB18.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

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
      data: aliceAskOrder,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askOrder, orderHash: askOrderHash } = (await getEventArgs(
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
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
      data: bobBidOrder,
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidOrder, orderHash: bidOrderHash } = (await getEventArgs(
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


    const txClearOrder = await orderBook
                      .connect(bountyBot)
                      .clear(askOrder, bidOrder, clearConfig) 

    const { sender: clearSender, owner: cancelOrderOwner, orderHash: cancelOrderHash } =
    (await getEventArgs(
      txClearOrder,
      "OrderNotFound",
      orderBook
    )) as OrderNotFoundEvent["args"]

    assert(clearSender === bountyBot.address);
    assert(cancelOrderOwner === bob.address);
    assert(cancelOrderHash.eq(bidOrderHash));
    


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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

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
      data: aliceAskOrder,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askSender, order: askOrder, orderHash: askOrderHash} = (await getEventArgs(
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
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
      data: bobBidOrder,
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { sender: bidSender, order: bidOrder, orderHash: bidOrderHash } = (await getEventArgs(
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

    const txClearOrder = await orderBook
                      .connect(bountyBot)
                      .clear(askOrder, bidOrder, clearConfig) 

    const { sender: clearSender, owner: cancelOrderOwner, orderHash: cancelOrderHash } =
    (await getEventArgs(
      txClearOrder,
      "OrderNotFound",
      orderBook
    )) as OrderNotFoundEvent["args"]

    assert(clearSender === bountyBot.address);
    assert(cancelOrderOwner === alice.address);
    assert(cancelOrderHash.eq(askOrderHash));
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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

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
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
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
          .clear(askOrder, bigConfigInvalid1, clearConfig),
      `TokenMismatch("${tokenB.address}", "${tokenA.address}")`,
      "did not validate input token"
    );
    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(askOrder, bigConfigInvalid0, clearConfig),
      `TokenMismatch("${tokenB.address}", "${tokenA.address}")`,
      "did not validate output token"
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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

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
      data: aliceAskOrder,
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
    const bobBidOrder = ethers.utils.toUtf8Bytes("bobBidOrder");

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
      data: bobBidOrder,
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
      `SameOwner("${alice2.address}")`,
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
    const aliceAskOrder = ethers.utils.toUtf8Bytes("aliceAskOrder");

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
        { token: tokenB.address, decimals: 18, vaultId: bobInputVault },
      ],
      validOutputs: [
        { token: tokenA.address, decimals: 18, vaultId: bobOutputVault },
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
    const { sender: afterClearSender , clearStateChange: clearStateChange } = (await getEventArgs(
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

    assert(afterClearSender === bountyBot.address);
    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, askOrder);
    compareSolStructs(clearB_, bidOrder);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);
  });

  it("should ensure that misconfigured decimals on tokens only harm the misconfigurer (order B)", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 6;
    const tokenBDecimals = 18;

    const incorrectTokenADecimals = 10;

    const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA06.initialize();
    await tokenB18.initialize();

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

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const askRatio = ethers.BigNumber.from(10).pow(18);
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
      data: [],
    };
    const txAskAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);
    const { order: askOrder } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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

    // Bids with incorrect decimals
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
          decimals: incorrectTokenADecimals,
          vaultId: bobOutputVault,
        },
      ],
      interpreterStateConfig: {
        sources: [bidSource, []],
        constants: bidConstants,
      },
      data: [],
    };
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS

    const depositAmountB = ethers.BigNumber.from(2 + eighteenZeros);

    // Deposit amount calculated with incorrect decimals
    const depositAmountA = fixedPointMul(
      depositAmountB,
      ethers.BigNumber.from(10).pow(
        18 + incorrectTokenADecimals - tokenBDecimals
      )
    );
    console.log("depositAmountA : ", depositAmountA); //20000000000

    const expectedAliceInputVaultAmount = fixedPointMul(
      depositAmountB,
      ethers.BigNumber.from(10).pow(18 + tokenADecimals - tokenBDecimals)
    );

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB18.address,
      vaultId: aliceOutputVault,
      amount: depositAmountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenA06.address,
      vaultId: bobOutputVault,
      amount: depositAmountA,
    };
    await tokenB18.transfer(alice.address, depositAmountB);
    await tokenA06.transfer(bob.address, depositAmountA);
    await tokenB18
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA06
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);
    // Alice deposits tokenB18 into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenA00 into his output vault
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

    await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);

    const aliceInputVaultBalance = await orderBook.vaultBalance(
      alice.address,
      tokenA06.address,
      aliceInputVault
    );

    const aliceOutputVaultBalance = await orderBook.vaultBalance(
      alice.address,
      tokenB18.address,
      aliceOutputVault
    );

    const bobInputVaultBalance = await orderBook.vaultBalance(
      bob.address,
      tokenB18.address,
      bobInputVault
    );

    const bobOutputVaultBalance = await orderBook.vaultBalance(
      bob.address,
      tokenA06.address,
      bobOutputVault
    );

    const bountyBotVaultA_ = await orderBook.vaultBalance(
      bountyBot.address,
      tokenB18.address,
      bountyBotVaultA
    );

    assert(
      aliceInputVaultBalance.add(bobOutputVaultBalance).eq(depositAmountA)
    );
    assert(bobInputVaultBalance.add(bountyBotVaultA_).eq(depositAmountB));

    assert(aliceInputVaultBalance.eq(expectedAliceInputVaultAmount));
    assert(aliceOutputVaultBalance.isZero());
  });
});
