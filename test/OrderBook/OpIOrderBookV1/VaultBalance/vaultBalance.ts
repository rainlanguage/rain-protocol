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

describe("IOrderBookV1 vault balance tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeOrderBook: FakeContract<OrderBook>;

  beforeEach(async () => {
    fakeOrderBook = await smock.fake("OrderBook");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct vault balance", async () => {
    const fakeOwner = 0x00;
    const fakeToken = 0x00;
    const fakeId = 0x00;

    const vaultBalance = 123 + eighteenZeros;

    fakeOrderBook.vaultBalance.returns(vaultBalance);

    const ORDERBOOK_ADDRESS = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const OWNER = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const sources = [concat([
        ORDERBOOK_ADDRESS(),
        OWNER(),
        TOKEN(),
        ID(),
      op(Opcode.IORDERBOOKV1_VAULT_BALANCE),
    ])];
    const constants = [fakeOrderBook.address, fakeOwner, fakeToken, fakeId];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await logic.run();

    const _vaultBalance = await logic.stackTop();

    assert(_vaultBalance.eq(vaultBalance));
  });
});
