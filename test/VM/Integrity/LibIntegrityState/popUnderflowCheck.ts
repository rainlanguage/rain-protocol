import { ethers } from "hardhat";
import type {
  LibIntegrityStateTest,
  StorageOpcodesRangeStruct,
} from "../../../../typechain/LibIntegrityStateTest";
import { Opcode } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityState popUnderflowCheck tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  it("should fail check for stack underflow if stackTop > stackMaxTop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 32;
    const stackTop = 64;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop > stackMaxTop"
    );
  });

  it("should fail check for stack underflow if stackTop == stackMaxTop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 32;
    const stackTop = 32;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop == stackMaxTop"
    );
  });

  it("should pass check for stack underflow if stackTop == stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 32;

    await libIntegrityState.popUnderflowCheck(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );
  });

  it("should fail check for stack underflow if stackTop < stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 0;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should pass check for stack underflow after pop on good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 32;

    await libIntegrityState.popUnderflowCheck(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );
  });
});
