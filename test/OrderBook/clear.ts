import { assert } from "chai";

import { ethers } from "hardhat";
import type { ReserveToken18, ReserveTokenDecimals } from "../../typechain";
import { OrderNotFoundEvent } from "../../typechain/contracts/orderbook/IOrderBookV1";
import {
  AddOrderEvent,
  AfterClearEvent,
  ClearConfigStruct,
  ClearEvent,
  ClearStateChangeStruct,
  ContextEvent,
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
import { getEventArgs, getEvents } from "../../utils/events";

import { fixedPointDiv, fixedPointMul, minBN } from "../../utils/math";
import { encodeMeta, getOrderConfig } from "../../utils/orderBook/order";
import { assertError } from "../../utils/test/assertError";
import {
  compareSolStructs,
  compareStructs,
} from "../../utils/test/compareStructs";

import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";

describe("OrderBook clear order", async function () {
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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("Order_A")
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txBobAddOrder = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txBobAddOrder,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA20.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA20.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txBobAddOrder = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txBobAddOrder,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA18.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA18.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );

      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB20.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);
      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB20.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );

      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB18.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);
      // note 18 decimals for outputMax
      // 1e18 means that only 1 unit of tokenB can be outputted per order
      const outputMax_A = ethers.BigNumber.from(1 + eighteenZeros);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        outputMax_A,
        tokenA00.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB18.address,
        tokenBDecimals,
        bobInputVault,
        tokenA00.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA20.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA20.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA18.address,
        tokenADecimals,
        aliceInputVault,
        tokenB06.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB06.address,
        tokenBDecimals,
        bobInputVault,
        tokenA18.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB20.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB20.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

      const aliceInputVaultBalance = await orderBook.vaultBalance(
        alice.address,
        tokenA06.address,
        aliceInputVault
      );
      const bobInputVaultBalance = await orderBook.vaultBalance(
        bob.address,
        tokenB20.address,
        bobInputVault
      );

      assert(aliceInputVaultBalance.eq(depositAmountA));
      assert(bobInputVaultBalance.eq(depositAmountB));
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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA06.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB18.address,
        tokenBDecimals,
        bobInputVault,
        tokenA06.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = (await getEventArgs(
        txAddOrderBob,
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

      const [, alice, bob, bountyBot] = signers;

      const orderBook = await deployOrderBook();

      const aliceInputVault = ethers.BigNumber.from(randomUint256());
      const aliceOutputVault = ethers.BigNumber.from(randomUint256());
      const bobInputVault = ethers.BigNumber.from(randomUint256());
      const bobOutputVault = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
      const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

      // Order_A

      // The ratio is 1:1 from the perspective of the expression.
      // This is a statement of economic equivalence in 18 decimal fixed point.
      const ratio_A = ethers.BigNumber.from(10).pow(18);

      const OrderConfig_A = await getOrderConfig(
        ratio_A,
        max_uint256,
        tokenA00.address,
        tokenADecimals,
        aliceInputVault,
        tokenB18.address,
        tokenBDecimals,
        aliceOutputVault,
        encodeMeta("")
      );
      const txAddOrderAlice = await orderBook
        .connect(alice)
        .addOrder(OrderConfig_A);
      const { order: Order_A } = (await getEventArgs(
        txAddOrderAlice,
        "AddOrder",
        orderBook
      )) as AddOrderEvent["args"];

      // Order_B

      const ratio_B = fixedPointDiv(ONE, ratio_A);

      const OrderConfig_B = await getOrderConfig(
        ratio_B,
        max_uint256,
        tokenB18.address,
        tokenBDecimals,
        bobInputVault,
        tokenA00.address,
        tokenADecimals,
        bobOutputVault,
        encodeMeta("")
      );
      const txAddOrderBob = await orderBook
        .connect(bob)
        .addOrder(OrderConfig_B);
      const { order: Order_B } = await getEventArgs(
        txAddOrderBob,
        "AddOrder",
        orderBook
      );
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
        aliceInputIOIndex: 0,
        aliceOutputIOIndex: 0,
        bobInputIOIndex: 0,
        bobOutputIOIndex: 0,
        aliceBountyVaultId: bountyBotVaultA,
        bobBountyVaultId: bountyBotVaultB,
      };

      await orderBook
        .connect(bountyBot)
        .clear(Order_A, Order_B, clearConfig, [], []);

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

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );
    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const {
      sender: sender_B,
      order: Order_B,
      orderHash: hashOrder_B,
    } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
    await orderBook.connect(bob).removeOrder(Order_B);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    const {
      sender: clearSender,
      owner: cancelOrderOwner,
      orderHash: cancelOrderHash,
    } = (await getEventArgs(
      txClearOrder,
      "OrderNotFound",
      orderBook
    )) as OrderNotFoundEvent["args"];

    assert(clearSender === bountyBot.address);
    assert(cancelOrderOwner === bob.address);
    assert(cancelOrderHash.eq(hashOrder_B));
  });

  it("orders must be live to clear (order A)", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const {
      sender: sender_A,
      order: Order_A,
      orderHash: hashOrder_A,
    } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
    await orderBook.connect(alice).removeOrder(Order_A);

    // BOUNTY BOT CLEARS THE ORDER

    const clearConfig: ClearConfigStruct = {
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    const {
      sender: clearSender,
      owner: cancelOrderOwner,
      orderHash: cancelOrderHash,
    } = (await getEventArgs(
      txClearOrder,
      "OrderNotFound",
      orderBook
    )) as OrderNotFoundEvent["args"];

    assert(clearSender === bountyBot.address);
    assert(cancelOrderOwner === alice.address);
    assert(cancelOrderHash.eq(hashOrder_A));
  });

  it("should validate input/output tokens", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);
    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    // Override Order_B config
    const bigConfigInvalid0 = {
      ...Order_B,
      validOutputs: [
        {
          ...Order_B.validOutputs[0],
          token: tokenB.address, // will result in mismatch
        },
      ],
    };
    const bigConfigInvalid1 = {
      ...Order_B,
      validInputs: [
        {
          ...Order_B.validInputs[0],
          token: tokenA.address, // will result in mismatch
        },
      ],
    };

    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(Order_A, bigConfigInvalid1, clearConfig, [], []),
      `TokenMismatch("${tokenB.address}", "${tokenA.address}")`,
      "did not validate input token"
    );
    await assertError(
      async () =>
        await orderBook
          .connect(bountyBot)
          .clear(Order_A, bigConfigInvalid0, clearConfig, [], []),
      `TokenMismatch("${tokenB.address}", "${tokenA.address}")`,
      "did not validate output token"
    );
  });

  it("should enforce different owner for Order_A and Order_B", async function () {
    const signers = await ethers.getSigners();

    const alice1 = signers[1];
    const alice2 = alice1; // 'Bob' is actually Alice in this case
    const bountyBot = signers[3];

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice1)
      .addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice1.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook
      .connect(alice2)
      .addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === alice2.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    await assertError(
      async () => await txClearOrder,
      `SameOwner("${alice2.address}")`,
      "did not revert with same owner for Order_A and Order_B "
    );
  });

  it("should add Order_A and Order_B and clear the order", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { sender: sender_A, order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const { sender: sender_B, order: Order_B } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    const {
      sender: clearSender,
      alice: clearA_,
      bob: clearB_,
      clearConfig: clearBountyConfig,
    } = (await getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { sender: afterClearSender, clearStateChange: clearStateChange } =
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
      aliceOutput: aOutputExpected,
      bobOutput: bOutputExpected,
      aliceInput: fixedPointMul(ratio_A, aOutputExpected),
      bobInput: fixedPointMul(ratio_B, bOutputExpected),
    };

    assert(afterClearSender === bountyBot.address);
    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, Order_A);
    compareSolStructs(clearB_, Order_B);
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

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    // The ratio is 1:1 from the perspective of the expression.
    // This is a statement of economic equivalence in 18 decimal fixed point.
    const ratio_A = ethers.BigNumber.from(10).pow(18);

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA06.address,
      tokenADecimals,
      aliceInputVault,
      tokenB18.address,
      tokenBDecimals,
      aliceOutputVault,
      encodeMeta("")
    );
    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const { order: Order_A } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB18.address,
      tokenBDecimals,
      bobInputVault,
      tokenA06.address,
      incorrectTokenADecimals,
      bobOutputVault,
      encodeMeta("")
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);
    const { order: Order_B } = (await getEventArgs(
      txAddOrderBob,
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
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

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

  it("should validate context emitted in context event when handleIO dispatch is zero", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, bountyBot] = signers;

    const orderBook = await deployOrderBook();
    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobInputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultA = ethers.BigNumber.from(randomUint256());
    const bountyBotVaultB = ethers.BigNumber.from(randomUint256());

    // Order_A

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);

    const aliceOrder = encodeMeta("Order_A");

    const OrderConfig_A: OrderConfigStruct = await getOrderConfig(
      ratio_A,
      max_uint256,
      tokenA.address,
      18,
      aliceInputVault,
      tokenB.address,
      18,
      aliceOutputVault,
      aliceOrder
    );

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(OrderConfig_A);

    const {
      sender: sender_A,
      order: Order_A,
      orderHash: hashOrder_A,
    } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_A === alice.address, "wrong sender");
    compareStructs(Order_A, OrderConfig_A);

    // Order_B

    const ratio_B = fixedPointDiv(ONE, ratio_A);

    const bobOrder = encodeMeta("Order_B");

    const OrderConfig_B: OrderConfigStruct = await getOrderConfig(
      ratio_B,
      max_uint256,
      tokenB.address,
      18,
      bobInputVault,
      tokenA.address,
      18,
      bobOutputVault,
      bobOrder
    );

    const txAddOrderBob = await orderBook.connect(bob).addOrder(OrderConfig_B);

    const {
      sender: sender_B,
      order: Order_B,
      orderHash: hashOrder_B,
    } = (await getEventArgs(
      txAddOrderBob,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(sender_B === bob.address, "wrong sender");
    compareStructs(Order_B, OrderConfig_B);

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
      aliceInputIOIndex: 0,
      aliceOutputIOIndex: 0,
      bobInputIOIndex: 0,
      bobOutputIOIndex: 0,
      aliceBountyVaultId: bountyBotVaultA,
      bobBountyVaultId: bountyBotVaultB,
    };

    const txClearOrder = await orderBook
      .connect(bountyBot)
      .clear(Order_A, Order_B, clearConfig, [], []);

    const {
      sender: clearSender,
      alice: clearA_,
      bob: clearB_,
      clearConfig: clearBountyConfig,
    } = (await getEventArgs(
      txClearOrder,
      "Clear",
      orderBook
    )) as ClearEvent["args"];
    const { clearStateChange: clearStateChange } = (await getEventArgs(
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
      aliceOutput: aOutputExpected,
      bobOutput: bOutputExpected,
      aliceInput: fixedPointMul(ratio_A, aOutputExpected),
      bobInput: fixedPointMul(ratio_B, bOutputExpected),
    };

    assert(clearSender === bountyBot.address);
    compareSolStructs(clearA_, Order_A);
    compareSolStructs(clearB_, Order_B);
    compareStructs(clearBountyConfig, clearConfig);
    compareStructs(clearStateChange, expectedClearStateChange);

    // Asserting Context Events
    const contextEvents = (await getEvents(
      txClearOrder,
      "Context",
      orderBook
    )) as ContextEvent["args"][];

    const { sender: sender0, context: context0_ } = contextEvents[0];
    const { sender: sender1, context: context1_ } = contextEvents[1];

    assert(sender0 === bountyBot.address);
    assert(sender1 === bountyBot.address);

    const aop = minBN(amountB, fixedPointMul(amountB, ratio_B));
    const bop = minBN(amountA, fixedPointMul(amountA, ratio_A));
    const aip = fixedPointMul(aop, ratio_A);
    const bip = fixedPointMul(bop, ratio_B);

    const expectedEvent0 = [
      [
        ethers.BigNumber.from(bountyBot.address),
        ethers.BigNumber.from(orderBook.address),
      ],
      [
        hashOrder_A,
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(bob.address),
      ],
      [amountB, ratio_A],
      [
        ethers.BigNumber.from(tokenA.address),
        ethers.BigNumber.from(18),
        aliceInputVault,
        0,
        aip,
      ],
      [
        ethers.BigNumber.from(tokenB.address),
        ethers.BigNumber.from(18),
        aliceOutputVault,
        amountB,
        aop,
      ],
    ];

    for (let i = 0; i < expectedEvent0.length; i++) {
      const rowArray = expectedEvent0[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context0_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                         expected  ${colElement}
                         got       ${context0_[i][j]}`);
        }
      }
    }

    const expectedEvent1 = [
      [
        ethers.BigNumber.from(bountyBot.address),
        ethers.BigNumber.from(orderBook.address),
      ],
      [
        hashOrder_B,
        ethers.BigNumber.from(bob.address),
        ethers.BigNumber.from(alice.address),
      ],
      [amountA, ratio_B],
      [
        ethers.BigNumber.from(tokenB.address),
        ethers.BigNumber.from(18),
        bobInputVault,
        0,
        bip,
      ],
      [
        ethers.BigNumber.from(tokenA.address),
        ethers.BigNumber.from(18),
        bobOutputVault,
        amountA,
        bop,
      ],
    ];

    for (let i = 0; i < expectedEvent1.length; i++) {
      const rowArray = expectedEvent1[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context1_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                         expected  ${colElement}
                         got       ${context1_[i][j]}`);
        }
      }
    }
  });
});
