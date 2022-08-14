import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../typechain/StandardIntegrity";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainVM stack op", async function () {
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

  it("should error when STACK operand references a stack element that hasn't yet been evaluated", async () => {
    const constants = [10, 20, 30];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
    ])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // at least an error
      "did not error when STACK operand references a stack element that hasn't yet been evaluated"
    );
  });

  it("should error when STACK operand references itself", async () => {
    const constants = [10, 20, 30];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
    ])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // at least an error
      "did not error when STACK operand references itself"
    );
  });

  it("should evaluate to correct stack element when STACK is called within a nested evaluation", async () => {
    const constants = [8, 16, 32, 64];

    // STACK should have access to all evaluated stack values

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // STACK should equal this
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // not this (well, not without operand = 2)
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.ADD, 3),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    const result = await logic.stackTop();
    const expected = constants[2] + constants[3] + constants[0];
    assert(
      result.eq(expected),
      `STACK operand evaluated to wrong stack element when STACK is called within a nested evaluation
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)", async () => {
    const constants = [10, 20, 30];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.ADD, 3),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    const result = await logic.stackTop();

    assert(
      result.eq(60),
      "STACK operand returned wrong stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)"
    );
  });

  it("should return correct stack element when specifying operand", async () => {
    const constants = [10, 20, 30];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    const result = await logic.stackTop();

    assert(
      result.eq(constants[1]),
      "STACK operand returned wrong stack element"
    );
  });
});
