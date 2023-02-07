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
import { getRainContractMetaBytes } from "../../utils";

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

    const orderBook = (await orderBookFactory.deploy(getRainContractMetaBytes("orderbook"))) as OrderBook;

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const ratio_A = ethers.BigNumber.from("90" + eighteenZeros);
    const constants_A = [max_uint256, ratio_A];
    const aOpMax = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const aRatio = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    // prettier-ignore
    const source_A = concat([
      aOpMax,
      aRatio,
    ]);
    const aliceOrder = ethers.utils.toUtf8Bytes("Order_A");

    const EvaluableConfig_A = await generateEvaluableConfig({
      sources: [source_A, []],
      constants: constants_A,
    });

    const OrderConfig_A: OrderConfigStruct = {
      validInputs: [
        { token: tokenA.address, decimals: 18, vaultId: aliceInputVault },
      ],
      validOutputs: [
        { token: tokenB.address, decimals: 18, vaultId: aliceOutputVault },
      ],
      evaluableConfig: EvaluableConfig_A,
      data: aliceOrder,
    };

    const txOrder_A = await orderBook.connect(alice).addOrder(OrderConfig_A);

    const { sender: liveSender_A, order: LiveOrder_A } = (await getEventArgs(
      txOrder_A,
      "AddOrder",
      orderBook
    )) as AddOrderEvent["args"];

    assert(liveSender_A === alice.address, "wrong sender");
    compareStructs(LiveOrder_A, OrderConfig_A);

    // REMOVE Order_A

    await assertError(
      async () => await orderBook.connect(bob).removeOrder(LiveOrder_A),
      `NotOrderOwner("${bob.address}", "${alice.address}")`,
      "bob wrongly removed alice's order"
    );

    const txRemoveOrder = await orderBook
      .connect(alice)
      .removeOrder(LiveOrder_A);

    const { sender: deadSender_A, order: DeadOrder_A } = (await getEventArgs(
      txRemoveOrder,
      "RemoveOrder",
      orderBook
    )) as RemoveOrderEvent["args"];

    assert(deadSender_A === alice.address, "wrong sender");
    compareStructs(DeadOrder_A, OrderConfig_A);
  });
});
