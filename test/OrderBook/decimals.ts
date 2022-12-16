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
  ClearConfigStruct,
  DepositConfigStruct,
  OrderConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  max_uint8,
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
import { fixedPointDiv } from "../../utils/math";
import { assertError } from "../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("OrderBook decimals", async function () {
  let orderBookFactory: ContractFactory;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployer(interpreter);
  });

  it("should not be able to provide OOB decimals beyond uint8", async function () {
    const signers = await ethers.getSigners();

    const tokenA06 = (await basicDeploy("ReserveTokenDecimals", {}, [
      6,
    ])) as ReserveTokenDecimals;
    const tokenB18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      18,
    ])) as ReserveTokenDecimals;
    await tokenA06.initialize();
    await tokenB18.initialize();

    const decimalsInBounds = max_uint8;
    const decimalsOutOfBounds = max_uint8.add(1);
    // const tokenADecimals = await tokenA06.decimals();
    const tokenBDecimals = await tokenB18.decimals();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // ASK ORDER

    const askRatio = ethers.BigNumber.from(1 + eighteenZeros);
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

    // IN BOUNDS
    const askOrderConfig0: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA06.address,
          decimals: decimalsInBounds,
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
      data: []
    };
    await orderBook.connect(alice).addOrder(askOrderConfig0);

    // OUT OF BOUNDS
    const askOrderConfig1: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA06.address,
          decimals: decimalsOutOfBounds,
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
      data: []
    };
    await assertError(
      async () => await orderBook.connect(alice).addOrder(askOrderConfig1),
      "value out-of-bounds",
      "did not revert with OOB error"
    );
  });

  it("ensure decimals can be read from context for _calculateOrderIO() and _recordVaultIO()", async function () {
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

    const askConstants = [
      askOutputMax,
      askRatio,
      tokenADecimals,
      tokenBDecimals,
    ];
    const vAskOutputMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vAskRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vTokenADecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vTokenBDecimals = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 3)
    );
    // prettier-ignore
    const askSource = concat([
      op(Opcode.CONTEXT, 0x0201), // input decimals
      vTokenADecimals,
      op(Opcode.EQUAL_TO),
      op(Opcode.ENSURE, 1),

      op(Opcode.CONTEXT, 0x0301), // output decimals
      vTokenBDecimals,
      op(Opcode.EQUAL_TO),
      op(Opcode.ENSURE, 1),

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
      data: []
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { order: askOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

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
      data: []
    };

    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);

    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS

    const amountB = ethers.BigNumber.from("1000" + "0".repeat(tokenBDecimals));
    const amountA = ethers.BigNumber.from("1000" + "0".repeat(tokenADecimals));

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
    await orderBook.connect(alice).deposit(depositConfigStructAlice);
    // Bob deposits tokenA06 into his output vault
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
  });
});
