import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  IInterpreterV1Consumer,
  Rainterpreter,
  Sale,
} from "../../../../typechain";
import {
  AllStandardOps,
  eighteenZeros,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("ISaleV2 TotalReserveReceived tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
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

    const expression0 = await expressionDeployConsumer(
      {
        sources,
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);

    const _totalReserveReceived = await logic.stackTop();

    assert(_totalReserveReceived.eq(totalReserveReceived));
  });
});
