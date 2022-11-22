import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat, hexlify, randomBytes } from "ethers/lib/utils";
import { AllStandardOpsTest, Sale } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("ISaleV2 Reserve tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct reserve", async () => {
    const reserve = hexlify(randomBytes(20));

    fakeSale.reserve.returns(reserve);

    const SALE_ADDRESS = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.ISALEV2_RESERVE),
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

    const _reserve = await logic.stackTop();

    assert(_reserve.eq(reserve));
  });
});
