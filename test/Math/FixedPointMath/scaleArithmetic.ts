import { assert } from "chai";
import { ethers } from "hardhat";
import { FixedPointMathTest } from "../../../typechain/contracts/test/math/FixedPointMath/FixedPointMathTest";

import { eighteenZeros, ONE } from "../../../utils";
import { fixedPointMathDeploy } from "../../../utils/deploy/math/fixedPointMath/deploy";

describe("FixedPointMathTest scaling during arithmetic op", async function () {
  let fixedPointMathTest: FixedPointMathTest;

  const ROUND_DOWN = 0;
  const ROUND_UP = 1;
  const ROUND_TO_ZERO = 2;

  before(async () => {
    fixedPointMathTest = await fixedPointMathDeploy();
  });

  it("should scale a number by 18 order of magnitude while multiplying", async () => {
    const a_ = 5;
    const b_ = ethers.BigNumber.from("1000000000000000000").mul(2);
    const result = await fixedPointMathTest["fixedPointMul(uint256,uint256,uint8)"](
      a_,
      b_,
      ROUND_UP
    );

    const expectedResult = ethers.BigNumber.from(a_).mul(b_).div(ONE);
    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while multiplying and round it to zero", async () => {
    const a_ = 5;
    const b_ = ethers.BigNumber.from("1382900000000000000").mul(2);

    const result = await fixedPointMathTest[
      "fixedPointMul(uint256,uint256,uint8)"
    ](a_, b_, ROUND_TO_ZERO);
    const expectedResult = ethers.BigNumber.from(a_).mul(b_).div(ONE);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while multiplying and round it down", async () => {
    const a_ = 3;
    const b_ = ethers.BigNumber.from("1382900000000000000").mul(2);
    const result = await fixedPointMathTest[
      "fixedPointMul(uint256,uint256,uint8)"
    ](a_, b_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(a_).mul(b_).div(ONE);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while multiplying and round it up (for mulmod(a_,b_,ONE) > 0 ) ", async () => {
    const a_ = 3;
    const b_ = ethers.BigNumber.from("1382900000000000000").mul(2);

    const result = await fixedPointMathTest[
      "fixedPointMul(uint256,uint256,uint8)"
    ](a_, b_, ROUND_UP);
    console.log("result : ", result);
    const expectedResult = ethers.BigNumber.from(a_)
      .mul(b_)
      .div(ONE)
      .add(ethers.BigNumber.from(1));

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while multiplying and round it up (for mulmod(a_,b_,ONE) == 0 ) ", async () => {
    const a_ = 2;
    const b_ = ethers.BigNumber.from("500000000000000000");

    const result = await fixedPointMathTest[
      "fixedPointMul(uint256,uint256,uint8)"
    ](a_, b_, ROUND_UP);

    const expectedResult0 = ethers.BigNumber.from(a_)
      .mul(b_)
      .div(ONE)
      .add(ethers.BigNumber.from(1));
    const expectedResult1 = ethers.BigNumber.from(a_).mul(b_).div(ONE);
    assert(!result.eq(expectedResult0));
    assert(result.eq(expectedResult1));
  });

  it("should scale a number by 18 order of magnitude while dividing", async () => {
    const a_ = 60;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest["fixedPointDiv(uint256,uint256,uint8)"](
      a_,
      b_,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing and round it to zero ", async () => {
    const a_ = 65;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest[
      "fixedPointDiv(uint256,uint256,uint8)"
    ](a_, b_, ROUND_TO_ZERO);
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing and round it down ", async () => {
    const a_ = 65;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest[
      "fixedPointDiv(uint256,uint256,uint8)"
    ](a_, b_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing and round it up (for mulmod(a_,b_,ONE) > 0 ) ", async () => {
    const a_ = 60;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest[
      "fixedPointDiv(uint256,uint256,uint8)"
    ](a_, b_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_);

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing and round it up (for mulmod(a_,b_,ONE) > 0 ) ", async () => {
    const a_ = 65;
    const b_ = ethers.BigNumber.from("2" + eighteenZeros);

    const result = await fixedPointMathTest[
      "fixedPointDiv(uint256,uint256,uint8)"
    ](a_, b_, ROUND_UP);
    const expectedResult0 = ethers.BigNumber.from(a_).mul(ONE).div(b_);
    const expectedResult1 = expectedResult0.add(ethers.BigNumber.from(1));

    assert(!result.eq(expectedResult0));
    assert(result.eq(expectedResult1));
  });
});
