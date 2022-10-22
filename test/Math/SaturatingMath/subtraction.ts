import { assert } from "chai";
import { SaturatingMathTest } from "../../../typechain/contracts/test/math/SaturatingMath/SaturatingMathTest";
import { saturatingMathDeploy } from "../../../utils/deploy/math/saturatingMath/deploy";

describe("SaturatingMathTest subtraction test", async function () {
  let saturatingMathTest: SaturatingMathTest;

  before(async () => {
    saturatingMathTest = await saturatingMathDeploy();
  });

  it("should return expected subtraction within typical (non-underflowing) bounds", async () => {
    const a_ = 42;
    const b_ = 9;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(a_ - b_));
  });

  it("should return saturated subtraction when operation would underflow", async () => {
    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(0));
  });
});
