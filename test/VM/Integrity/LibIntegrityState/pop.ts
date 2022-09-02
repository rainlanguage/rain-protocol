import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibIntegrityStateTest } from "../../../../typechain";
import { StorageOpcodesRangeStruct } from "../../../../typechain/contracts/vm/runtime/RainVM";
import { Opcode } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityState pop tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  // pop n

  it("should fail pop n if stackTop > stackMaxTop after pop", async function () {
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
    const stackTop = 160;
    const n = 2;

    await assertError(
      async () => {
        await libIntegrityState[
          "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256,uint256)"
        ](
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop,
          n
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check"
    );
  });

  it("should fail pop n if stackTop == stackMaxTop after pop", async function () {
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
    const stackTop = 128;
    const n = 2;

    await assertError(
      async () => {
        await libIntegrityState[
          "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256,uint256)"
        ](
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop,
          n
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check"
    );
  });

  it("should pop n if stackTop == stackBottom after pop", async function () {
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
    const stackTop = 96;
    const n = 2;

    const stackTopAfter_ = await libIntegrityState[
      "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256,uint256)"
    ](
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop,
      n
    );

    assert(stackTopAfter_.eq(stackTop - 32 * n));
  });

  it("should pop n on the good path", async function () {
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
    const stackTop = 96;
    const n = 2;

    const stackTopAfter_ = await libIntegrityState[
      "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256,uint256)"
    ](
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop,
      n
    );

    assert(stackTopAfter_.eq(stackTop - 32 * n));
  });

  // pop

  it("should fail pop if stackTop > stackMaxTop after pop", async function () {
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
    const stackTop = 128;

    await assertError(
      async () => {
        await libIntegrityState[
          "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256)"
        ](
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check"
    );
  });

  it("should fail pop if stackTop == stackMaxTop after pop", async function () {
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
    const stackTop = 96;

    await assertError(
      async () => {
        await libIntegrityState[
          "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256)"
        ](
          sources,
          storageOpcodesRange,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check"
    );
  });

  it("should pop if stackTop == stackBottom after pop", async function () {
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
    const stackTop = 64;

    const stackTopAfter_ = await libIntegrityState[
      "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256)"
    ](
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );

    assert(stackTopAfter_.eq(stackTop - 32));
  });

  it("should pop on the good path", async function () {
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
    const stackTop = 64;

    const stackTopAfter_ = await libIntegrityState[
      "pop(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256)"
    ](
      sources,
      storageOpcodesRange,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );

    assert(stackTopAfter_.eq(stackTop - 32));
  });
});
