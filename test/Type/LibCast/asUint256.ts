import { assert } from "chai";
import type { LibCastTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libCastDeploy } from "../../../utils/deploy/type/libCast/deploy";

describe("LibCast asUint256 tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    libCast = await libCastDeploy();
  });

  it("retypes array of integrity functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256ArrayIntPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256ArrayIntPtrs([...randomNums]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });

  it("retypes array of op functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256ArrayOpPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256ArrayOpPtrs([...randomNums]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });
});
