import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  LibIntegrityStateTest,
  StorageOpcodesRangeStruct,
} from "../../../../typechain";
import { Opcode } from "../../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityState ensureIntegrity tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  it("should check the integrity of the specified source", async function () {
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.length + 1, 0), // OOB opcode with no pointer
      ]),
      new Uint8Array(),
    ];

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const sourceIndex = 1;
    const stackTop = 0;
    const minimumFinalStackIndex = 0;

    const ensureIntegrity_ = libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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
    const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

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

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 2;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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
    const v3 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

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

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 3;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const _stackTop_ = await libIntegrityState.callStatic.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const tx_ = await libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 1;

    const ensureIntegrity_ = libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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

  it("should ensure integrity of very basic IntegrityState", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 0;

    const stackTop_ = await libIntegrityState.callStatic.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
      constantsLength,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const tx_ = await libIntegrityState.ensureIntegrityTest(
      sources,
      storageOpcodesRange,
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
