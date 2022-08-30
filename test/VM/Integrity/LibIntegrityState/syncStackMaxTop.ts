import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibIntegrityStateTest } from "../../../../typechain";
import { StorageOpcodesRangeStruct } from "../../../../typechain/contracts/vm/runtime/RainVM";

describe("LibIntegrityState syncStackMaxTop tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  it("should sync stack max top if stackTop gt stackMaxTop", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 1; // stackTop > stackMaxTop

    const newStackMaxTop_ = await libIntegrityState.callStatic.syncStackMaxTop(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackMaxTop,
      stackTop
    );

    const tx_ = await libIntegrityState.syncStackMaxTop(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackMaxTop,
      stackTop
    );

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "syncStackMaxTop did not modify memory"
    );

    assert(
      newStackMaxTop_.eq(stackTop),
      "did not update stackMaxTop to new stackTop"
    );
  });

  it("should not sync stack max top if stackTop lt stackMaxTop", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackMaxTop = 2;
    const stackTop = 1; // stackTop < stackMaxTop

    const newStackMaxTop_ = await libIntegrityState.callStatic.syncStackMaxTop(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackMaxTop,
      stackTop
    );

    const tx_ = await libIntegrityState.syncStackMaxTop(
      sources,
      storageOpcodesRange,
      constantsLength,
      stackMaxTop,
      stackTop
    );

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "syncStackMaxTop modified memory");

    assert(
      newStackMaxTop_.eq(stackMaxTop),
      "wrongly updated stackMaxTop to stackTop less than current stackMaxTop"
    );
  });
});
