import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { OrderBook, ReserveToken18 } from "../../typechain";
import {
  AddOrderEvent,
  OrderConfigStruct,
  RemoveOrderEvent,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import { eighteenZeros, max_uint256 } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";

import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../utils/test/assertError";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("OrderBook remove order", async function () {
  let orderBookFactory: ContractFactory;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should support removing orders", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

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

    const askEvaluableConfig = await generateEvaluableConfig({
      sources: [askSource, []],
      constants: askConstants,
    });

    const askOrderConfig: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: askEvaluableConfig,
      data: aliceAskOrder,
    };

    const txAskAddOrder = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askLiveSender, order: askLiveOrder } = (await getEventArgs(
      txAskAddOrder,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(askLiveSender === alice.address, "wrong sender");
    compareStructs(askLiveOrder, askOrderConfig);

    // REMOVE ASK ORDER

    await assertError(
      async () => await orderBook.connect(bob).removeOrder(askLiveOrder),
      `NotOrderOwner("${bob.address}", "${alice.address}")`,
      "bob wrongly removed alice's order"
    );

    const txAskRemoveOrder = await orderBook
      .connect(alice)
      .removeOrder(askLiveOrder);

    const { sender: askDeadSender, order: askDeadOrder } = (await getEventArgs(
      txAskRemoveOrder,
      "RemoveOrder",
      orderBook
    )) as RemoveOrderEvent["args"];

    assert(askDeadSender === alice.address, "wrong sender");
    compareStructs(askDeadOrder, askOrderConfig);
  });
});
