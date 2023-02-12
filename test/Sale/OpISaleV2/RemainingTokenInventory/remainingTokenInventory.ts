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
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("ISaleV2 RemainingTokenInventory tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
  let fakeSale: FakeContract<Sale>;

  beforeEach(async () => {
    fakeSale = await smock.fake("Sale");
  });

  before(async () => { 
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]); 

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should return correct remaining token inventory", async () => {
    const remainingTokenInventory = 123 + eighteenZeros;

    fakeSale.remainingTokenInventory.returns(remainingTokenInventory);

    const SALE_ADDRESS = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.isaleV2RemainingTokenInventory),
    ])];
    const constants = [fakeSale.address];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants,
      
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const _remainingTokenInventory = await logic.stackTop();

    assert(_remainingTokenInventory.eq(remainingTokenInventory));
  });
});
