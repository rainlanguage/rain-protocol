// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { strict as assert } from "assert";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  ERC3156FlashBorrowerBuyTest,
  ReserveToken18,
} from "../../../typechain";
import {
  AddOrderEvent,
  DepositConfigStruct,
  OrderConfigStruct,
  TakeOrderConfigStruct,
  TakeOrderEvent,
  TakeOrdersConfigStruct,
} from "../../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  sixteenZeros,
} from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { deployOrderBook } from "../../../utils/deploy/orderBook/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { encodeMeta } from "../../../utils/orderBook/order";

const Opcode = AllStandardOps;

describe("OrderBook takeOrders sloshy tests", async function () {
  let USDT: ReserveToken18;
  let DAI: ReserveToken18;

  let erc3156Bot: ERC3156FlashBorrowerBuyTest;

  beforeEach(async () => {
    USDT = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    DAI = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await USDT.initialize();
    await DAI.initialize();

    erc3156Bot = (await basicDeploy(
      "ERC3156FlashBorrowerBuyTest",
      {}
    )) as ERC3156FlashBorrowerBuyTest;
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should complete an e2e slosh with a loan", async function () {
    const signers = await ethers.getSigners();

    const [, alice] = signers;

    const orderBook = await deployOrderBook();

    const vaultAlice = ethers.BigNumber.from(randomUint256());

    const threshold = ethers.BigNumber.from(101 + sixteenZeros); // 1%

    const constants = [max_uint256, threshold];

    const vMaxAmount = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThreshold = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const source = concat([
      vMaxAmount,
      vThreshold,
    ]);

    // 1. alice's order says she will give anyone 1 DAI who can give her 1.01 USDT
    const evaluableConfig = await generateEvaluableConfig(
      [source, []],
      constants
    );

    const orderConfig: OrderConfigStruct = {
      validInputs: [{ token: USDT.address, decimals: 18, vaultId: vaultAlice }],
      validOutputs: [{ token: DAI.address, decimals: 18, vaultId: vaultAlice }],
      evaluableConfig,
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(orderConfig);

    const { order: askOrder } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // 1.1 Alice deposits DAI into her output vault
    const amountDAI = ethers.BigNumber.from("1" + eighteenZeros);
    await DAI.transfer(alice.address, amountDAI);
    const depositConfigStructAlice: DepositConfigStruct = {
      token: DAI.address,
      vaultId: vaultAlice,
      amount: amountDAI,
    };
    await DAI.connect(alice).approve(
      orderBook.address,
      depositConfigStructAlice.amount
    );

    const _txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);

    const takeOrderConfigStruct: TakeOrderConfigStruct = {
      order: askOrder,
      inputIOIndex: 0,
      outputIOIndex: 0,
      signedContext: [],
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: USDT.address,
      input: DAI.address,
      minimumInput: amountDAI,
      maximumInput: amountDAI,
      maximumIORatio: threshold,
      orders: [takeOrderConfigStruct],
    };

    // 2. consider the setup where erc3156Bot doesn't have 1 DAI already, erc3156Bot must flash loan alice's 1 DAI
    // 3. erc3156Bot 'sells' flash loaned 1 DAI to uni for 1.02 USDT (assuming this happens externally)

    // since we're only mocking interaction with external market, we can just give bot the USDT it would buy from market in advance
    const amountUniUSDT = ethers.BigNumber.from(102 + sixteenZeros); // 2%
    await USDT.transfer(erc3156Bot.address, amountUniUSDT);

    // 4. erc3156Bot takes alice's order (erc3156Bot sells 1.01 USDT to alice for 1 DAI)
    await orderBook.flashLoan(
      erc3156Bot.address,
      DAI.address,
      amountDAI,
      ethers.utils.defaultAbiCoder.encode(
        [
          {
            type: "tuple",
            name: "takeOrdersConfig",
            components: [
              { name: "output", type: "address" },
              { name: "input", type: "address" },
              { name: "minimumInput", type: "uint256" },
              { name: "maximumInput", type: "uint256" },
              { name: "maximumIORatio", type: "uint256" },
              {
                type: "tuple[]",
                name: "orders",
                components: [
                  {
                    type: "tuple",
                    name: "order",
                    components: [
                      { name: "owner", type: "address" },
                      { name: "handleIO", type: "bool" },
                      {
                        name: "evaluable",
                        type: "tuple",
                        components: [
                          { name: "interpreter", type: "address" },
                          { name: "store", type: "address" },
                          { name: "expression", type: "address" },
                        ],
                      },
                      {
                        name: "validInputs",
                        type: "tuple[]",
                        components: [
                          { name: "token", type: "address" },
                          { name: "decimals", type: "uint256" },
                          {
                            name: "vaultId",
                            type: "uint256",
                          },
                        ],
                      },
                      {
                        name: "validOutputs",
                        type: "tuple[]",
                        components: [
                          { name: "token", type: "address" },
                          { name: "decimals", type: "uint256" },
                          {
                            name: "vaultId",
                            type: "uint256",
                          },
                        ],
                      },
                    ],
                  },
                  { name: "inputIOIndex", type: "uint256" },
                  { name: "outputIOIndex", type: "uint256" },
                  {
                    type: "tuple[]",
                    name: "signedContext",
                    components: [
                      { name: "signer", type: "address" },
                      { name: "signature", type: "bytes" },
                      { name: "context", type: "uint256[]" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        [takeOrdersConfigStruct]
      )
    );

    // market now has 1 DAI
    const marketDAIBalance = await DAI.balanceOf(
      "0x0000000000000000000000000000000000000001" // address(1)
    );
    assert(marketDAIBalance.eq(amountDAI), "wrong DAI balance");

    // erc3156Bot now has 0 DAI and 0.01 USDT
    const expectedFinalERC3156BotUSDTBalance = ethers.BigNumber.from(
      1 + sixteenZeros
    ); // 0.01 USDT
    const erc3156BotDAIBalance = await DAI.balanceOf(erc3156Bot.address);
    const erc3156BotUSDTBalance = await USDT.balanceOf(erc3156Bot.address);
    assert(erc3156BotDAIBalance.isZero(), "wrong DAI balance");
    assert(
      erc3156BotUSDTBalance.eq(expectedFinalERC3156BotUSDTBalance),
      "wrong USDT balance"
    );

    // alice now has 0 DAI and 1.01 USDT
    await orderBook.connect(alice).withdraw({
      token: USDT.address,
      vaultId: vaultAlice,
      amount: max_uint256, // takes entire vault balance
    });
    const aliceUSDTBalance = await USDT.balanceOf(alice.address);
    const aliceDAIBalance = await DAI.balanceOf(alice.address);
    assert(aliceUSDTBalance.eq(threshold), "wrong USDT balance");
    assert(aliceDAIBalance.eq(0), "wrong DAI balance");
  });

  it("should complete an e2e slosh without a loan", async function () {
    const signers = await ethers.getSigners();

    const [, alice, bob, uni] = signers;

    const orderBook = await deployOrderBook();

    const vaultAlice = ethers.BigNumber.from(randomUint256());

    const threshold = ethers.BigNumber.from(101 + sixteenZeros); // 1%

    const constants = [max_uint256, threshold];

    const vMaxAmount = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThreshold = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const source = concat([
      vMaxAmount,
      vThreshold,
    ]);

    const evaluableConfig = await generateEvaluableConfig(
      [source, []],
      constants
    );

    // 1. alice's order says she will give anyone 1 DAI who can give her 1.01 USDT
    const orderConfig: OrderConfigStruct = {
      validInputs: [{ token: USDT.address, decimals: 18, vaultId: vaultAlice }],
      validOutputs: [{ token: DAI.address, decimals: 18, vaultId: vaultAlice }],
      evaluableConfig,
      meta: encodeMeta(""),
    };

    const txAddOrderAlice = await orderBook
      .connect(alice)
      .addOrder(orderConfig);

    const { order: askOrder } = (await getEventArgs(
      txAddOrderAlice,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    // 1.1 Alice deposits DAI into her output vault
    const amountDAI = ethers.BigNumber.from("1" + eighteenZeros);
    await DAI.transfer(alice.address, amountDAI);
    const depositConfigStructAlice: DepositConfigStruct = {
      token: DAI.address,
      vaultId: vaultAlice,
      amount: amountDAI,
    };
    await DAI.connect(alice).approve(
      orderBook.address,
      depositConfigStructAlice.amount
    );

    const _txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);

    // 2. consider the setup where bob simply has 1 DAI already
    await DAI.transfer(bob.address, amountDAI);

    // 3. bob sells his 1 DAI to uni for 1.02 USDT assuming this (happens externally)
    const amountUniUSDT = ethers.BigNumber.from(102 + sixteenZeros); // 2%
    await USDT.transfer(uni.address, amountUniUSDT);

    // 3.1 bob transfering 1 DAI to uni
    await DAI.connect(bob).transfer(uni.address, amountDAI);
    // 3.2 bob receiving 1.02 USDT from uni
    await USDT.connect(uni).transfer(bob.address, amountUniUSDT);

    // 4. bob takes alice's order (bob sells his 1.01 USDT to alice for 1 DAI)
    const takeOrderConfigStruct: TakeOrderConfigStruct = {
      order: askOrder,
      inputIOIndex: 0,
      outputIOIndex: 0,
      signedContext: [],
    };

    const takeOrdersConfigStruct: TakeOrdersConfigStruct = {
      output: USDT.address,
      input: DAI.address,
      minimumInput: amountDAI,
      maximumInput: amountDAI,
      maximumIORatio: threshold,
      orders: [takeOrderConfigStruct],
    };

    await USDT.connect(bob).approve(orderBook.address, threshold);

    const txTakeOrders = await orderBook
      .connect(bob)
      .takeOrders(takeOrdersConfigStruct);

    const { sender, config, input, output } = (await getEventArgs(
      txTakeOrders,
      "TakeOrder",
      orderBook
    )) as TakeOrderEvent["args"];

    assert(sender === bob.address, "wrong sender");
    assert(input.eq(amountDAI), "wrong input");
    assert(output.eq(threshold), "wrong output");
    compareStructs(config, takeOrderConfigStruct);

    // 4.1 bob now has 1 DAI and 0.01 USDT
    const bobUSDTBalance = await USDT.balanceOf(bob.address);
    const bobDAIBalance = await DAI.balanceOf(bob.address);
    const expectedBalance = amountUniUSDT.sub(threshold);
    assert(bobUSDTBalance.eq(expectedBalance), "wrong USDT balance");
    assert(bobDAIBalance.eq(amountDAI), "wrong DAI balance");

    // 5. alice now has 0 DAI and 1.01 USDT
    await orderBook.connect(alice).withdraw({
      token: USDT.address,
      vaultId: vaultAlice,
      amount: max_uint256, // takes entire vault balance
    });
    const aliceUSDTBalance = await USDT.balanceOf(alice.address);
    const aliceDAIBalance = await DAI.balanceOf(alice.address);
    assert(aliceUSDTBalance.eq(threshold), "wrong USDT balance");
    assert(aliceDAIBalance.eq(0), "wrong DAI balance");
  });
});
