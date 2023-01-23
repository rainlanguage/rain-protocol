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
import { ClearConfigStruct } from "../../typechain/contracts/orderbook/IOrderBookV1";
import {
  AddOrderEvent,
  ContextEvent,
  DepositConfigStruct,
  DepositEvent,
  OrderConfigStruct,
  OrderExceedsMaxRatioEvent,
  OrderNotFoundEvent,
  OrderZeroAmountEvent,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../typechain/contracts/orderbook/OrderBook";
import {
  RainterpreterOps,
  assertError,
  fixedPointMul,
  randomUint256,
  minBN,
  fixedPointDiv,
} from "../../utils";
import {
  eighteenZeros,
  max_uint256,
  ONE,
  sixteenZeros,
  sixZeros,
  tenZeros,
  twentyZeros,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs, getEvents } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = RainterpreterOps;

describe("OrderBook take orders", async function () {
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

  it.only("precision check for clear set1", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 18
    const tokenBDecimals = 13;

    const aOpMax  = ethers.BigNumber.from("17585051");
    const bOpMax  = ethers.BigNumber.from("1");
    const askRatio = ethers.BigNumber.from("1000000000000000000");
    const bidRatio = (fixedPointDiv(ONE, askRatio))
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from("14667003501636060");

    const tokenA18 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB13 = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA18.initialize();
    await tokenB13.initialize();

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

    const askConstants = [aOpMax, askRatio];
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

    const bidConstants = [bOpMax, bidRatio];
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
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS


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


    const clearOrder = await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);
    assert(clearOrder)

  });

  it("precision check for clear set2", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 29
    const tokenBDecimals = 1;

    const aOpMax  = ethers.BigNumber.from("4591230885962751121505035506311926492009552198803386111640697963211189819");
    const bOpMax  = ethers.BigNumber.from("470270942975533370416921295702772956228611933235887488170598738804685019");
    const askRatio = ethers.BigNumber.from("1175177649833617774368545097050886942400156334429750465420241703156423155585");
    const bidRatio = (fixedPointDiv(ONE, askRatio))
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from("63960615973362915565203616228777850002511732201605807624885181844784932");

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

    const askConstants = [aOpMax, askRatio];
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

    const bidConstants = [bOpMax, bidRatio];
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
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS


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


    const clearOrder = await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);
    assert(clearOrder)

  });

  it("precision check for clear set3", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 26
    const tokenBDecimals = 1;

    const aOpMax  = ethers.BigNumber.from("26463885895328345577211921813695381690127259970605975505916846452453755");
    const bOpMax  = ethers.BigNumber.from("431192408550959312672645692694710218368782522445737767612048740285893401");
    const askRatio = ethers.BigNumber.from("249087209243637393807293408550361061689511538399682265326027092758904");
    const bidRatio = (fixedPointDiv(ONE, askRatio))
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from("66917336752889936941066703153277788474150611831121217389925613487639");

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

    const askConstants = [aOpMax, askRatio];
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

    const bidConstants = [bOpMax, bidRatio];
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
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS


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


    const clearOrder = await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);
    assert(clearOrder)

  });

  it("precision check for clear set4", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 26
    const tokenBDecimals = 1;

    const aOpMax  = ethers.BigNumber.from("129685438594462622193294594929799955253604058343889380565356228649641104695");
    const bOpMax  = ethers.BigNumber.from("31808355997366964249578456795948801761029869974262843889913067983472873067");
    const askRatio = ethers.BigNumber.from("333972095574532672828591181617962405");
    const bidRatio = (fixedPointDiv(ONE, askRatio))
    const depositAmountA = ethers.BigNumber.from("323052743423174644339519283108387159");
    const depositAmountB = ethers.BigNumber.from("25471188245690491407809063357893053");

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

    const askConstants = [aOpMax, askRatio];
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

    const bidConstants = [bOpMax, bidRatio];
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
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS


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


    const clearOrder = await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);
    assert(clearOrder)

  });

  it("precision check for clear set5", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 30
    const tokenBDecimals = 0;

    const aOpMax  = ethers.BigNumber.from("186318059882168061450623632507706992163669353895");
    const bOpMax  = ethers.BigNumber.from("791137610405993382165500946567631785709293026093923");
    const askRatio = ethers.BigNumber.from("697910990625929612238030319682222854");
    const bidRatio = (fixedPointDiv(ONE, askRatio))
    const depositAmountA = ethers.BigNumber.from("44079388953244442112453587119084001");
    const depositAmountB = ethers.BigNumber.from("337867147626607664800830233957704231");

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

    const askConstants = [aOpMax, askRatio];
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

    const bidConstants = [bOpMax, bidRatio];
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
    const txBidAddOrder = await orderBook.connect(bob).addOrder(bidOrderConfig);
    const { order: bidOrder } = (await getEventArgs(
      txBidAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // DEPOSITS


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


    const clearOrder = await orderBook.connect(bountyBot).clear(askOrder, bidOrder, clearConfig);
    assert(clearOrder)

  });


});
