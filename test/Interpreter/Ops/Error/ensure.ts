import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("ENSURE Opcode test", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should execute the transaction if it passes the ensure opcode condition", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
            v1,
            v2,
            v3,
        op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v1,
    ]);

    const expression0 = await expressionConsumerDeploy(
      [source0],
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // 2 ? 2 : 3
            v2,
            v2,
            v3,
        op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v3
    ]);

    const expression1 = await expressionConsumerDeploy(
      [source1],
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop();

    assert(result1.eq(3), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
            v0,
            v2,
            v3,
        op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v0
    ]);

    const expression2 = await expressionConsumerDeploy(
      [source2],
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );
    const result2 = await logic.stackTop();

    assert(result2.eq(0), `returned wrong value from eager if, got ${result2}`);
  });

  it("should revert the transaction if it fails ensure opcode condition", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
            v0,
            v2,
            v0,
        op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v1,
    ]);

    const expression0 = await expressionConsumerDeploy(
      [source0],
      constants,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "",
      "did not revert even after failing the ensure opcode condition"
    );
    const source1 = concat([
      // 2 ? 2 : 3
      v2,
      v0,
      v3,
      op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v3,
    ]);

    const expression1 = await expressionConsumerDeploy(
      [source1],
      constants,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression1.dispatch,
          []
        ),
      "",
      "did not revert even after failing the ensure opcode condition"
    );

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
            v0,
            v2,
            v0,
        op(Opcode.eager_if),
      op(Opcode.ensure, 1),
      v0
    ]);

    const expression2 = await expressionConsumerDeploy(
      [source2],
      constants,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression2.dispatch,
          []
        ),
      "",
      "did not revert even after failing the ensure opcode condition"
    );
  });
});
