import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { AllStandardOpsTest, Sale } from "../../../../typechain";
import {
  AllStandardOps,
  eighteenZeros,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("ISaleV2 RemainingTokenInventory tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct remaining token inventory", async () => {
    const remainingTokenInventory = 123 + eighteenZeros;

    fakeSale.remainingTokenInventory.returns(remainingTokenInventory);

    const SALE_ADDRESS = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.ISALEV2_REMAINING_TOKEN_INVENTORY),
    ])];
    const constants = [fakeSale.address];

    await logic.initialize({
      sources,
      constants,
    });

    await logic.run();

    const _remainingTokenInventory = await logic.stackTop();

    assert(_remainingTokenInventory.eq(remainingTokenInventory));
  });
});
