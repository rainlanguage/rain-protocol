import { assert } from "chai";
import type { LibIntegrityCheckTest } from "../../../../typechain";

import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityCheckState/deploy";

describe("LibIntegrityCheck syncStackMaxTop tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
  });

  it("should sync stack max top if stackTop gt stackMaxTop", async function () {
    const source0 = Uint8Array.from([]);
    const sources = [source0];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 1; // stackTop > stackMaxTop

    const newStackMaxTop_ =
      await libIntegrityCheckState.callStatic.syncStackMaxTop(
        sources,
        constantsLength,
        stackMaxTop,
        stackTop
      );

    const tx_ = await libIntegrityCheckState.syncStackMaxTop(
      sources,
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

    const constantsLength = 0;
    const stackMaxTop = 2;
    const stackTop = 1; // stackTop < stackMaxTop

    const newStackMaxTop_ =
      await libIntegrityCheckState.callStatic.syncStackMaxTop(
        sources,
        constantsLength,
        stackMaxTop,
        stackTop
      );

    const tx_ = await libIntegrityCheckState.syncStackMaxTop(
      sources,
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
