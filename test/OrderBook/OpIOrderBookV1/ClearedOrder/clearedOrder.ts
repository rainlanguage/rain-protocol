import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { AllStandardOpsTest, OrderBook } from "../../../../typechain";
import {
  AllStandardOps,
  eighteenZeros,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("IOrderBookV1 cleared order value tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeOrderBook: FakeContract<OrderBook>;

  beforeEach(async () => {
    fakeOrderBook = await smock.fake("OrderBook");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct cleared order value", async () => {
    const fakeOrderHash = 0x00;

    const clearedOrderValue = 123 + eighteenZeros;

    fakeOrderBook.clearedOrder.returns(clearedOrderValue);

    const ORDERBOOK_ADDRESS = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const ORDER_HASH = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [concat([
        ORDERBOOK_ADDRESS(),
        ORDER_HASH(),
      op(Opcode.IORDERBOOKV1_CLEARED_ORDER),
    ])];
    const constants = [fakeOrderBook.address, fakeOrderHash];

    await logic.initialize({
      sources,
      constants,
    });

    await logic.run();

    const _clearedOrderValue = await logic.stackTop();

    assert(_clearedOrderValue.eq(clearedOrderValue));
  });
});
