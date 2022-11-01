import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat, hexlify, randomBytes } from "ethers/lib/utils";
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

describe("ISaleV2 Token tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct token", async () => {
    const token = hexlify(randomBytes(20));

    fakeSale.token.returns(token);

    const SALE_ADDRESS = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.ISALEV2_TOKEN),
    ])];
    const constants = [fakeSale.address];

    await logic.initialize({
      sources,
      constants,
    });

    await logic.run();

    const _token = await logic.stackTop();

    assert(_token.eq(token));
  });
});
