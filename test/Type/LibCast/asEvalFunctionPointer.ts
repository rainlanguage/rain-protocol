import { assert } from "chai";
import type { LibCastTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libCastDeploy } from "../../../utils/deploy/type/libCast/deploy";

describe("LibCast asEvalFunctionPointer tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    libCast = await libCastDeploy();
  });

  it("retypes an integer to an eval function pointer without corrupting memory", async function () {
    const tx_ = await libCast.asEvalFunctionPointer(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });
});
