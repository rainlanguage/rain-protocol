import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("HASH Opcode test", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
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
    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic.run();
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
    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic.runContext(context);
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
    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic.run();
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
