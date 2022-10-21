import { assert } from "chai";
import * as Util from "../../../utils";
import { saturatingMathDeploy } from "../../../utils/deploy/math/saturatingMath/deploy";

describe("SaturatingMathTest addition test", async function () {
  it("should return expected addition within typical (non-overflowing) bounds", async () => {
    const saturatingMathTest = await saturatingMathDeploy();

    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingAdd(a_, b_);

    assert(result.eq(a_ + b_));
  });

  it("should return saturated addition when operation would overflow", async () => {
    const saturatingMathTest = await saturatingMathDeploy();

    const a_ = Util.max_uint256;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingAdd(a_, b_);

    assert(result.eq(Util.max_uint256));
  });
});
