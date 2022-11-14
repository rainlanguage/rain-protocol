import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { AllStandardOpsTest, Sale } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import { SaleStatus } from "../../../../utils/types/saleEscrow";

const Opcode = AllStandardOps;

describe("ISaleV2 SaleStatus tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return correct saleStatus", async () => {
    const SALE_ADDRESS = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.ISALEV2_SALE_STATUS),
    ])];
    const constants = [fakeSale.address];

    await logic.initialize({
      sources,
      constants,
    });

    const saleStatus0 = SaleStatus.Pending;
    fakeSale.saleStatus.returns(saleStatus0);
    await logic.run();
    const _saleStatus0 = await logic.stackTop();
    assert(_saleStatus0.eq(saleStatus0));

    const saleStatus1 = SaleStatus.Active;
    fakeSale.saleStatus.returns(saleStatus1);
    await logic.run();
    const _saleStatus1 = await logic.stackTop();
    assert(_saleStatus1.eq(saleStatus1));

    const saleStatus2 = SaleStatus.Success;
    fakeSale.saleStatus.returns(saleStatus2);
    await logic.run();
    const _saleStatus2 = await logic.stackTop();
    assert(_saleStatus2.eq(saleStatus2));

    const saleStatus3 = SaleStatus.Fail;
    fakeSale.saleStatus.returns(saleStatus3);
    await logic.run();
    const _saleStatus3 = await logic.stackTop();
    assert(_saleStatus3.eq(saleStatus3));
  });
});
