import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  IInterpreterV1Consumer,
  OrderBook,
  Rainterpreter,
} from "../../../../typechain";
import {
  AllStandardOps,
  eighteenZeros,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("IOrderBookV1 vault balance tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
  let fakeOrderBook: FakeContract<OrderBook>;

  beforeEach(async () => {
    fakeOrderBook = await smock.fake("OrderBook");
  });

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
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

    const expression0 = await expressionConsumerDeploy(
      {
        sources,
        constants,
      },
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const _vaultBalance = await logic.stackTop();

    assert(_vaultBalance.eq(vaultBalance));
  });
});
