import { FakeContract, smock } from "@defi-wonderland/smock";
import { strict as assert } from "assert";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  IInterpreterV1Consumer,
  Rainterpreter,
  Sale,
} from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { SaleStatus } from "../../../../utils/types/saleEscrow";

const Opcode = AllStandardOps;

describe("ISaleV2 SaleStatus tests", async function () {
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

  it("should return correct saleStatus", async () => {
    const SALE_ADDRESS = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sources = [concat([
      SALE_ADDRESS(),
      op(Opcode.sale_v2_sale_status),
    ])];
    const constants = [fakeSale.address];

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,

      rainInterpreter,
      1
    );

    const saleStatus0 = SaleStatus.Pending;
    fakeSale.saleStatus.returns(saleStatus0);
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const _saleStatus0 = await logic.stackTop();
    assert(_saleStatus0.eq(saleStatus0));

    const saleStatus1 = SaleStatus.Active;
    fakeSale.saleStatus.returns(saleStatus1);
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const _saleStatus1 = await logic.stackTop();
    assert(_saleStatus1.eq(saleStatus1));

    const saleStatus2 = SaleStatus.Success;
    fakeSale.saleStatus.returns(saleStatus2);
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const _saleStatus2 = await logic.stackTop();
    assert(_saleStatus2.eq(saleStatus2));

    const saleStatus3 = SaleStatus.Fail;
    fakeSale.saleStatus.returns(saleStatus3);
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const _saleStatus3 = await logic.stackTop();
    assert(_saleStatus3.eq(saleStatus3));
  });
});
