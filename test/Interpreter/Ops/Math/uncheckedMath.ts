import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AllStandardOpsTest,
  StandardIntegrity,
} from "../../../../typechain";
import { max_uint256 } from "../../../../utils/constants";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { assertError } from "../../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainInterpreter unchecked math", async () => {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should panic when accumulator overflows with exponentiation op", async () => {
    const constants = [max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTwo = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.EXP, 2)
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    const constants = [max_uint256.div(2), 3];

    const vHalfMaxUInt256 = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThree = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    const constants = [0, 1];

    const vZero = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vOne = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "Error",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    const constants = [max_uint256, 1];

    const vMaxUInt256 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vOne = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "Error",
      "accumulator overflow did not panic"
    );
  });
});
