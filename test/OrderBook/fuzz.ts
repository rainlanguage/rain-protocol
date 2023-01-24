import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { BigNumber, ContractFactory, Signer } from "ethers";
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
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  async function placeOrder(
    orderBook: OrderBook,
    tokenA: ReserveTokenDecimals,
    tokenB: ReserveTokenDecimals,
    tokenADecimals,
    tokenBDecimals,
    inputVault: BigNumber,
    outputVault: BigNumber,
    opMax: BigNumber,
    ratio: BigNumber,
    signer: SignerWithAddress
  ) {
    const constants = [opMax, ratio];
    const vOpMax = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vRatio = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // prettier-ignore
    const aSource = concat([
        vOpMax,
        vRatio,
    ]);
    const OrderAConfig: OrderConfigStruct = {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      validInputs: [
        {
          token: tokenA.address,
          decimals: tokenADecimals,
          vaultId: inputVault,
        },
      ],
      validOutputs: [
        {
          token: tokenB.address,
          decimals: tokenBDecimals,
          vaultId: outputVault,
        },
      ],
      interpreterStateConfig: {
        sources: [aSource, []],
        constants: constants,
      },
      data: [],
    };

    const txAskAddOrderAlice = await orderBook
      .connect(signer)
      .addOrder(OrderAConfig);
    const { order: Order } = (await getEventArgs(
      txAskAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    return Order;
  }

  async function deposit(
    orderBook: OrderBook,
    token: ReserveTokenDecimals,
    vault: BigNumber,
    amount: BigNumber,
    signer: SignerWithAddress
  ) {
    const depositConfigStruct: DepositConfigStruct = {
      token: token.address,
      vaultId: vault,
      amount: amount,
    };

    await token.transfer(signer.address, amount);

    await token
      .connect(signer)
      .approve(orderBook.address, depositConfigStruct.amount);

    await orderBook.connect(signer).deposit(depositConfigStruct);
  }

  it("precision check for clear set1", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 18;
    const tokenBDecimals = 13;

    const aOpMax = ethers.BigNumber.from("17585051");
    const bOpMax = ethers.BigNumber.from("1");
    const aRatio = ethers.BigNumber.from("1000000000000000000");
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from("14667003501636060");

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  });

  it("precision check for clear set2", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 29;
    const tokenBDecimals = 1;

    const aOpMax = ethers.BigNumber.from(
      "4591230885962751121505035506311926492009552198803386111640697963211189819"
    );
    const bOpMax = ethers.BigNumber.from(
      "470270942975533370416921295702772956228611933235887488170598738804685019"
    );
    const aRatio = ethers.BigNumber.from(
      "1175177649833617774368545097050886942400156334429750465420241703156423155585"
    );
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from(
      "63960615973362915565203616228777850002511732201605807624885181844784932"
    );

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  });

  it("precision check for clear set3", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 26;
    const tokenBDecimals = 1;

    const aOpMax = ethers.BigNumber.from(
      "26463885895328345577211921813695381690127259970605975505916846452453755"
    );
    const bOpMax = ethers.BigNumber.from(
      "431192408550959312672645692694710218368782522445737767612048740285893401"
    );
    const aRatio = ethers.BigNumber.from(
      "249087209243637393807293408550361061689511538399682265326027092758904"
    );
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from("1");
    const depositAmountB = ethers.BigNumber.from(
      "66917336752889936941066703153277788474150611831121217389925613487639"
    );

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  });

  it("precision check for clear set4", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 26;
    const tokenBDecimals = 1;

    const aOpMax = ethers.BigNumber.from(
      "129685438594462622193294594929799955253604058343889380565356228649641104695"
    );
    const bOpMax = ethers.BigNumber.from(
      "31808355997366964249578456795948801761029869974262843889913067983472873067"
    );
    const aRatio = ethers.BigNumber.from(
      "333972095574532672828591181617962405"
    );
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from(
      "323052743423174644339519283108387159"
    );
    const depositAmountB = ethers.BigNumber.from(
      "25471188245690491407809063357893053"
    );

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  });

  it("precision check for clear set5", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 30;
    const tokenBDecimals = 0;

    const aOpMax = ethers.BigNumber.from(
      "186318059882168061450623632507706992163669353895"
    );
    const bOpMax = ethers.BigNumber.from(
      "791137610405993382165500946567631785709293026093923"
    );
    const aRatio = ethers.BigNumber.from(
      "697910990625929612238030319682222854"
    );
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from(
      "44079388953244442112453587119084001"
    );
    const depositAmountB = ethers.BigNumber.from(
      "337867147626607664800830233957704231"
    );

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  }); 

  it("precision check for clear set6", async function () {
    const signers = await ethers.getSigners();

    const tokenADecimals = 30;
    const tokenBDecimals = 0;

    const aOpMax = ethers.BigNumber.from(
      "246487766678802707191321038764076276757293207148"
    );
    const bOpMax = ethers.BigNumber.from(
      "75451180054003223084498607591795744215977377"
    );
    const aRatio = ethers.BigNumber.from(
      "950610197942869080605564992733574069"
    );
    const bRatio = fixedPointDiv(ONE, aRatio);
    const depositAmountA = ethers.BigNumber.from(
      "57455560544194283819536923068784775"
    );
    const depositAmountB = ethers.BigNumber.from(
      "353943369138734637913010548764147629"
    );

    const tokenA = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenADecimals,
    ])) as ReserveTokenDecimals;
    const tokenB = (await basicDeploy("ReserveTokenDecimals", {}, [
      tokenBDecimals,
    ])) as ReserveTokenDecimals;
    await tokenA.initialize();
    await tokenB.initialize();

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

    //  ORDER A
    const Order_A = await placeOrder(
      orderBook,
      tokenA,
      tokenB,
      tokenADecimals,
      tokenBDecimals,
      aliceInputVault,
      aliceOutputVault,
      aOpMax,
      aRatio,
      alice
    );

    //  ORDER B

    const Order_B = await placeOrder(
      orderBook,
      tokenB,
      tokenA,
      tokenBDecimals,
      tokenADecimals,
      bobInputVault,
      bobOutputVault,
      bOpMax,
      bRatio,
      bob
    );

    // DEPOSITS

    await deposit(orderBook, tokenB, aliceOutputVault, depositAmountB, alice);

    await deposit(orderBook, tokenA, bobOutputVault, depositAmountA, bob);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aInputIOIndex: 0,
      aOutputIOIndex: 0,
      bInputIOIndex: 0,
      bOutputIOIndex: 0,
      aBountyVaultId: bountyBotVaultA,
      bBountyVaultId: bountyBotVaultB,
    };

    const clearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig);
    assert(clearOrder);
  });
  
});
