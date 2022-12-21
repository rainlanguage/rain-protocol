import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("HASH Opcode test", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should hash a list of values from constant", async () => {
    const constants = [100, 200, 300];

    // prettier-ignore
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.HASH, 3),
    ]);
    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [constants]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });

  it("should hash a list of values from context", async () => {
    const alice = (await ethers.getSigners())[0];

    const constants = [];
    const context = [[alice.address, 0x12031]];

    // prettier-ignore
    const source = concat([
        op(Opcode.CONTEXT, 0x0000),
        op(Opcode.CONTEXT, 0x0001),
      op(Opcode.HASH, 2),
    ]);
    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, context);
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [context[0]]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });

  it("should hash a single value", async () => {
    const constants = [ethers.constants.MaxUint256];

    // prettier-ignore
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.HASH, 1),
    ]);
    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [constants]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );
  });
});
