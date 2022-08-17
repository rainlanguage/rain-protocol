import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  LibIntegrityStateTest,
  StorageOpcodesRangeStruct,
} from "../../../../typechain/LibIntegrityStateTest";

describe("LibIntegrityState ensureIntegrity tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  it("should ensure integrity of IntegrityState", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];
    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const integrityPointers = [];
    const sourceIndex = 0;
    const stackTop = 0;
    const minimumFinalStackIndex = 0;

    const stackTop_ = await libIntegrityState.callStatic.ensureIntegrity(
      sources,
      storageOpcodesRange,
      constantsLength,
      integrityPointers,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const tx_ = await libIntegrityState.ensureIntegrity(
      sources,
      storageOpcodesRange,
      constantsLength,
      integrityPointers,
      sourceIndex,
      stackTop,
      minimumFinalStackIndex
    );

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ === memDumpAfter_,
      "ensureIntegrity wrongly modified memory"
    );

    assert(stackTop_.eq(stackTop), "stackTop should remain unchanged");
  });
});
