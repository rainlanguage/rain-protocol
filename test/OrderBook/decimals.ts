import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { OrderBook, ReserveTokenDecimals } from "../../typechain";
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
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { fixedPointDiv } from "../../utils/math";
import { assertError } from "../../utils/test/assertError";
import { getRainContractMetaBytes } from "../../utils";

const Opcode = AllStandardOps;

describe("OrderBook decimals", async function () {
  let orderBookFactory: ContractFactory;

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);
    const outputMax_A = ethers.BigNumber.from(3 + eighteenZeros);
    const constants_A = [outputMax_A, ratio_A];
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
    const EvaluableConfig_A0 = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    // IN BOUNDS
    const OrderConfig_A0: OrderConfigStruct = {
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
      evaluableConfig: EvaluableConfig_A0,
      data: [],
    };
    await orderBook.connect(alice).addOrder(OrderConfig_A0);
    const EvaluableConfig_A1 = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    // OUT OF BOUNDS
    const OrderConfig_A1: OrderConfigStruct = {
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
      evaluableConfig: EvaluableConfig_A1,
      data: [],
    };
    await assertError(
      async () => await orderBook.connect(alice).addOrder(OrderConfig_A1),
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

    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    // note 18 decimals for ratio
    // 1e18 means that 1 unit of tokenA is equivalent to 1 unit of tokenB
    const ratio_A = ethers.BigNumber.from(1 + eighteenZeros);

    // note 18 decimals for outputMax
    // 3e18 means that only 3 units of tokenB can be outputted per order
    const outputMax_A = ethers.BigNumber.from(3 + eighteenZeros);

    const constants_A = [outputMax_A, ratio_A, tokenADecimals, tokenBDecimals];
    const aOpMax = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const aRatio = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vTokenADecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vTokenBDecimals = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 3)
    );
    // prettier-ignore
    const source_A = concat([
      op(Opcode.context, 0x0201), // input decimals
      vTokenADecimals,
      op(Opcode.equal_to),
      op(Opcode.ensure, 1),

      op(Opcode.context, 0x0301), // output decimals
      vTokenBDecimals,
      op(Opcode.equal_to),
      op(Opcode.ensure, 1),

      aOpMax,
      aRatio,
    ]);

    const EvaluableConfig_A = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    const OrderConfig_A: OrderConfigStruct = {
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
      evaluableConfig: EvaluableConfig_A,
      data: [],
    };

    const txOrder_A = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txOrder_A,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A); // no need to account for decimals difference

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
    const EvaluableConfig_B = await generateEvaluableConfig({
      sources: [source_B, []],
      constants: constants_B,
    });
    const OrderConfig_B: OrderConfigStruct = {
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
      evaluableConfig: EvaluableConfig_B,
      data: [],
    };

    const txOrder_B = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { order: Order_B } = (await getEventArgs(
      txOrder_B,
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

    await orderBook.connect(bountyBot).clear(Order_A, Order_B, clearConfig);
  });
});
