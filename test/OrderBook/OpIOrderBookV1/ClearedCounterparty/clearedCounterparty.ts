import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
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

describe("IOrderBookV1 cleared counterparty value tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeOrderBook: FakeContract<OrderBook>;

  beforeEach(async () => {
    fakeOrderBook = await smock.fake("OrderBook");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct cleared counterparty value", async () => {
    const fakeOrderHash = 0x00;
    const fakeCounterparty = 0x00;

    const clearedCounterpartyValue = 123 + eighteenZeros;

    fakeOrderBook.clearedCounterparty.returns(clearedCounterpartyValue);

    const ORDERBOOK_ADDRESS = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const ORDER_HASH = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const COUNTERPARTY = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [concat([
        ORDERBOOK_ADDRESS(),
        ORDER_HASH(),
        COUNTERPARTY(),
      op(Opcode.IORDERBOOKV1_CLEARED_COUNTERPARTY),
    ])];
    const constants = [fakeOrderBook.address, fakeOrderHash, fakeCounterparty];

    await logic.initialize({
      sources,
      constants,
    });

    await logic.run();

    const _clearedCounterpartyValue = await logic.stackTop();

    assert(_clearedCounterpartyValue.eq(clearedCounterpartyValue));
  });
});
