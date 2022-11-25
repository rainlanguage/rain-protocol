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

describe("ISaleV2 TotalReserveReceived tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct total reserve received", async () => {
    const totalReserveReceived = 123 + eighteenZeros;

    fakeSale.totalReserveReceived.returns(totalReserveReceived);

    const SALE_ADDRESS = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.ISALEV2_TOTAL_RESERVE_RECEIVED),
    ])];
    const constants = [fakeSale.address];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await logic["run()"]();

    const _totalReserveReceived = await logic.stackTop();

    assert(_totalReserveReceived.eq(totalReserveReceived));
  });
});
