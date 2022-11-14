import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("READ_MEMORY Opcode test", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should read a value from CONSTANT and place it on the STACK", async () => {
    const constants = [1337, 123, 12, 3123];
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
    ]);

    await logic.initialize({
      sources: [sourceMAIN],
      constants: constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    console.log(await logic.stack());
    const expectedResult0 = ethers.BigNumber.from(1337);
    expect(result0).deep.equal(
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  // it("should read a value from STACK and place it on the STACK", async () => {
  //   const constants = [1337];
  //   // prettier-ignore
  //   const sourceMAIN = concat([
  //       op(Opcode.BLOCK_TIMESTAMP),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
  //   ]);

  //   await logic.initialize({
  //     sources: [sourceMAIN],
  //     constants: constants,
  //   });

  //   await logic.run();
  //   const expectedTimeStamp = await getBlockTimestamp();

  //   const result0 = await logic.stack();
  //   const expectedResult0 = [
  //     ethers.BigNumber.from(expectedTimeStamp),
  //     ethers.BigNumber.from(1337),
  //     ethers.BigNumber.from(1337),
  //     ethers.BigNumber.from(expectedTimeStamp),
  //   ];

  //   expect(result0).deep.equal(
  //     expectedResult0,
  //     `Invalid output, expected ${expectedResult0}, actual ${result0}`
  //   );
  // });

  // it("should fail when reading an OOB STACK value", async () => {
  //   const constants = [1337];
  //   // prettier-ignore
  //   const sourceMAIN = concat([
  //       op(Opcode.BLOCK_TIMESTAMP),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)), // Reading an OOB value
  //   ]);

  //   await assertError(
  //     async () =>
  //       await logic.initialize({
  //         sources: [sourceMAIN],
  //         constants: constants,
  //       }),
  //     "OOB_STACK_READ",
  //     "Integrity check failed while reading an OOB stack value"
  //   );
  // });

  // it("should fail when reading an OOB CONSTANT value", async () => {
  //   const constants = [1337];
  //   // prettier-ignore
  //   const sourceMAIN = concat([
  //       op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //       op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // Reading an OOB value
  //   ]);

  //   await assertError(
  //     async () =>
  //       await logic.initialize({
  //         sources: [sourceMAIN],
  //         constants: constants,
  //       }),
  //     "OOB_CONSTANT_READ",
  //     "Integrity check failed while reading an OOB constant value"
  //   );
  // });

  // it("should error when STACK operand references a STACK element that hasn't yet been evaluated", async () => {
  //   const constants = [10, 20, 30];

  //   // prettier-ignore
  //   const sources = [concat([
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
  //   ])];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "OOB_STACK_READ", // at least an error
  //     "did not error when STACK operand references a stack element that hasn't yet been evaluated"
  //   );
  // });

  // it("should error when STACK operand references itself", async () => {
  //   const constants = [10, 20, 30];

  //   // prettier-ignore
  //   const sources = [concat([
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
  //   ])];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "OOB_STACK_READ", // at least an error
  //     "did not error when STACK operand references itself"
  //   );
  // });

  // it("should evaluate to correct stack element when STACK is called within a nested evaluation", async () => {
  //   const constants = [8, 16, 32, 64];

  //   // STACK should have access to all evaluated stack values

  //   // prettier-ignore
  //   const sources = [concat([
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // STACK should equal this
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // not this (well, not without operand = 2)
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
  //     op(Opcode.ADD, 3),
  //   ])];

  //   await logic.initialize({ sources, constants });
  //   await logic.run();

  //   const result = await logic.stackTop();
  //   const expected = constants[2] + constants[3] + constants[0];
  //   assert(
  //     result.eq(expected),
  //     `STACK operand evaluated to wrong stack element when STACK is called within a nested evaluation
  //     expected  ${expected}
  //     got       ${result}`
  //   );
  // });

  // it("should return correct stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)", async () => {
  //   const constants = [10, 20, 30];

  //   // prettier-ignore
  //   const sources = [concat([
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
  //     op(Opcode.ADD, 3),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
  //   ])];

  //   await logic.initialize({ sources, constants });
  //   await logic.run();

  //   const result = await logic.stackTop();

  //   assert(
  //     result.eq(60),
  //     "STACK operand returned wrong stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)"
  //   );
  // });

  // it("should return correct stack element when specifying operand", async () => {
  //   const constants = [10, 20, 30];

  //   // prettier-ignore
  //   const sources = [concat([
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
  //     op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
  //   ])];

  //   await logic.initialize({ sources, constants });
  //   await logic.run();

  //   const result = await logic.stackTop();

  //   assert(
  //     result.eq(constants[1]),
  //     "STACK operand returned wrong stack element"
  //   );
  // });

  // it("should error when script references out-of-bounds opcode", async () => {
  //   const constants = [];

  //   const sources = [concat([op(99)])];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "Error",
  //     "did not error when script references out-of-bounds opcode"
  //   );
  // });

  // // it("should error when trying to read an out-of-bounds argument", async () => {
  // //   const constants = [1, 2, 3];
  // //   const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
  // //   const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
  // //   const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

  // //   const a0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
  // //   const a1 = op(Opcode.CONSTANT, 4);
  // //   const aOOB = op(Opcode.CONSTANT, 6);

  // //   // zero-based counting
  // //   const sourceIndex = 1; // 1
  // //   const loopSize = 0; // 1
  // //   const valSize = 2; // 3

  // //   // prettier-ignore
  // //   const sources = [
  // //     concat([
  // //         v1,
  // //         v2,
  // //         v3,
  // //       op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
  // //     ]),
  // //     concat([
  // //       // (arg0 arg1 arg2 add)
  // //         a0,
  // //         a1,
  // //         aOOB,
  // //       op(Opcode.ADD, 3),
  // //     ]),
  // //   ];

  // //   await assertError(
  // //     async () => await logic.initialize({ sources, constants }),
  // //     "", // there is at least an error
  // //     "did not error when trying to read an out-of-bounds argument"
  // //   );
  // // });

  // it("should error when trying to read an out-of-bounds constant", async () => {
  //   const constants = [1];
  //   const vOOB = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

  //   const sources = [concat([vOOB])];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "", // there is at least an error
  //     "did not error when trying to read an out-of-bounds constant"
  //   );
  // });

  // it("should prevent bad RainInterpreter script attempting to access stack index out of bounds (underflow)", async () => {
  //   const constants = [0, 1];
  //   const v0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
  //   const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

  //   // prettier-ignore
  //   const sources = [
  //     concat([
  //         v0,
  //         v1,
  //       op(Opcode.EAGER_IF),
  //     ]),
  //   ];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "STACK_UNDERFLOW",
  //     "did not prevent bad RainInterpreter script accessing stack index out of bounds"
  //   );
  // });

  // it("should prevent bad RainInterpreter script attempting to access stack index out of bounds (overflow)", async () => {
  //   const constants = [3, 2, 1];
  //   const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
  //   const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
  //   const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

  //   // prettier-ignore
  //   const sources = [
  //     concat([
  //       // (1 2 3 +)
  //         v1,
  //         v2,
  //         v3,
  //       op(Opcode.ADD, 4),
  //     ]),
  //   ];

  //   await assertError(
  //     async () => await logic.initialize({ sources, constants }),
  //     "STACK_UNDERFLOW",
  //     "did not prevent bad RainInterpreter script accessing stack index out of bounds"
  //   );
  // });
});
