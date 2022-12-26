import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { LibIntegrityCheckTest } from "../../../../typechain";
import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityCheckState/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityCheck ensureIntegrity tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
  });

  it("should check the integrity of the specified source", async function () {
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.length + 1, 0), // OOB opcode with no pointer
      ]),
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const sourceIndex = 1;
    const stackTop = 0;
    const minimumFinalStackIndex = 0;

    const ensureIntegrity_ = libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    // should pass, because we aren't checking sources[0] which would fail
    await ensureIntegrity_;
  });

  it("should fail integrity with opcode without pointer", async function () {
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.length + 1, 0), // OOB opcode with no pointer
      ]),
    ];

    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    await assertError(
      async () => {
        await ensureIntegrity_;
      },
      "VM Exception while processing transaction: reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)",
      "did not error with OOB opcode"
    );
  });

  it("should fail integrity with OOB constant read", async function () {
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.ADD, 3),
      ]),
    ];

    const constantsLength = 2;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    await assertError(
      async () => {
        await ensureIntegrity_;
      },
      "OOB_CONSTANT_READ",
      "did not error with OOB constant read"
    );
  });

  it("should ensure integrity with 1 source", async function () {
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.ADD, 3),
      ]),
    ];

    const constantsLength = 3;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const _stackTop_ =
      await libIntegrityCheckState.callStatic.ensureIntegrityTest(
        sources,
        constantsLength,
        sourceIndex,
        stackTop,
        minimumFinalStackIndex
      );

    const tx_ = await libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "ensureIntegrity did not modify memory"
    );
  });

  it("should ensure integrity of when final stack top less than minimum", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];

    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    await assertError(
      async () => {
        await ensureIntegrity_;
      },
      "MIN_FINAL_STACK",
      "did not error with final stack top less than minimum"
    );
  });

  it("should ensure integrity of very basic IntegrityCheckState", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];

    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 0;

    const stackTop_ =
      await libIntegrityCheckState.callStatic.ensureIntegrityTest(
        sources,
        constantsLength,
        sourceIndex,
        stackTop,
        minimumFinalStackIndex
      );

    const tx_ = await libIntegrityCheckState.ensureIntegrityTest(
      sources,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ === memDumpAfter_,
      "ensureIntegrity wrongly modified memory with zero sources"
    );

    assert(stackTop_.eq(stackTop), "stackTop should remain unchanged");
  });
});
