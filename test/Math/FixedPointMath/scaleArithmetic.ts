import { assert } from "chai";
import { ethers } from "hardhat";
import { FixedPointMathTest } from "../../../typechain/contracts/test/math/FixedPointMath/FixedPointMathTest";

import { eighteenZeros, ONE } from "../../../utils";
import { fixedPointMathDeploy } from "../../../utils/deploy/math/fixedPointMath/deploy";

describe("FixedPointMathTest scaling during arithmetic op", async function () {
  let fixedPointMathTest: FixedPointMathTest;

  before(async () => {
    fixedPointMathTest = await fixedPointMathDeploy();
  });

  it("should scale a number by 18 order of magnitude while multiplying", async () => {
    const a_ = 5;
    const b_ = ONE.mul(2);

    const result = await fixedPointMathTest.fixedPointMul(a_, b_);
    const expectedResult = ethers.BigNumber.from(a_).mul(b_).div(ONE);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing", async () => {
    const a_ = 60;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest.fixedPointDiv(a_, b_);
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_);

    assert(result.eq(expectedResult));
  });
});
