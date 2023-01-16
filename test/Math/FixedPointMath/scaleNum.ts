import { assert } from "chai";
import { ethers } from "hardhat";
import { FixedPointMathTest } from "../../../typechain/contracts/test/math/FixedPointMath/FixedPointMathTest";
import { eighteenZeros, sixZeros, tenZeros } from "../../../utils";
import { fixedPointMathDeploy } from "../../../utils/deploy/math/fixedPointMath/deploy";

describe("FixedPointMathTest scaling a number", async function () {
  let fixedPointMathTest: FixedPointMathTest;

  const ROUND_DOWN = 0;
  const ROUND_UP = 1;
  const ROUND_TO_ZERO = 2;

  before(async () => {
    fixedPointMathTest = await fixedPointMathDeploy();
  });

  // Scale 18
  it("should scale a fixed point decimal UP to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1 + sixZeros);
    const aDecimals_ = 8; // 0.01

    const result = await fixedPointMathTest.scale18(a_, aDecimals_,ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + tenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros + sixZeros);
    const aDecimals_ = 24; // 1.0

    const result = await fixedPointMathTest.scale18(a_, aDecimals_,ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 0 order of magnitude decimal to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1);
    const aDecimals_ = 0; // 1.0

    const result = await fixedPointMathTest.scale18(a_, aDecimals_,ROUND_TO_ZERO);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  // Scale N
  it("should scale a fixed point decimal UP to scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 20;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_,ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 8;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_,ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 OOM in situ [scaleN]", async () => {
    const a_ = ethers.BigNumber.from(1);
    const targetDecimals_ = 18;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_,ROUND_TO_ZERO);
    const expectedResult = ethers.BigNumber.from(1);
    assert(result.eq(expectedResult));
  });

  // Scale By
  it("should scale a fixed point decimal UP by scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_,ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN by scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + sixZeros + "00");
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_,ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 18 order of magnitude decimal by scale 0", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 0;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_,ROUND_TO_ZERO);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });
});
