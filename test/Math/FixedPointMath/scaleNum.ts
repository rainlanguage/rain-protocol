import { assert } from "chai";
import { ethers } from "hardhat";
import { LibFixedPointMathTest } from "../../../typechain/contracts/test/math/LibFixedPointMath/LibFixedPointMathTest";
import {
  eighteenZeros,
  sixteenZeros,
  sixZeros,
  tenZeros,
} from "../../../utils";
import { fixedPointMathDeploy } from "../../../utils/deploy/math/fixedPointMath/deploy";

describe("LibFixedPointMathTest scaling a number", async function () {
  let fixedPointMathTest: LibFixedPointMathTest;

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

    const result = await fixedPointMathTest.scale18(a_, aDecimals_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + tenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal UP to scale 18 for a_ != scaled_ * b_", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "3367");
    const aDecimals_ = 20;
    const result = await fixedPointMathTest.scale18(a_, aDecimals_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros + "33").add(
      ethers.BigNumber.from(1)
    );
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros + sixZeros);
    const aDecimals_ = 24; // 1.0

    const result = await fixedPointMathTest.scale18(a_, aDecimals_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale 18 for (a_ != scaled_ * b_)", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "3667");
    const aDecimals_ = 20;

    const result = await fixedPointMathTest.scale18(a_, aDecimals_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros + "36");
    assert(result.eq(expectedResult));
  });

  it("should scale a 0 order of magnitude decimal to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1);
    const aDecimals_ = 0; // 1.0
    const result = await fixedPointMathTest.scale18(
      a_,
      aDecimals_,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 0 order of magnitude decimal to scale 18", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "3667");
    const aDecimals_ = 20;
    const result = await fixedPointMathTest.scale18(
      a_,
      aDecimals_,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros + "36");
    assert(result.eq(expectedResult));
  });

  // Scale N
  it("should scale a fixed point decimal UP to scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 20;

    const result = await fixedPointMathTest.scaleN(
      a_,
      targetDecimals_,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal UP to scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "36");
    const targetDecimals_ = 11;

    const result = await fixedPointMathTest.scaleN(
      a_,
      targetDecimals_,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(10 + tenZeros).add(
      ethers.BigNumber.from(1)
    );
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 8;
    const result = await fixedPointMathTest.scaleN(
      a_,
      targetDecimals_,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal UP to scale N", async () => {
    const a_ = ethers.BigNumber.from(178945 + tenZeros + "36");
    const targetDecimals_ = 12;
    const result = await fixedPointMathTest.scaleN(
      a_,
      targetDecimals_,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(178945 + "000000");
    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 OOM in situ [scaleN]", async () => {
    const a_ = ethers.BigNumber.from(1);
    const targetDecimals_ = 18;

    const result = await fixedPointMathTest.scaleN(
      a_,
      targetDecimals_,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1);
    assert(result.eq(expectedResult));
  });

  // Scale By
  it("should scale a fixed point decimal UP by scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal UP by scale N (scaleBy_ < 0) ", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal UP by scale N (scaleBy_ < 0) ", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "36");
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_, ROUND_UP);
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros).add(
      ethers.BigNumber.from(1)
    );
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN by scale N", async () => {
    const a_ = ethers.BigNumber.from(1 + sixZeros + "00");
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN by scale N (scaleBy_ < 0) ", async () => {
    const a_ = ethers.BigNumber.from(1 + sixteenZeros + "36");
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_, ROUND_DOWN);
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 18 order of magnitude decimal by scale 0", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 0;

    const result = await fixedPointMathTest.scaleBy(
      a_,
      scaleBy_,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  // Scale Ratio

  it("should scale ratio UP for aDecimals > bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 12;
    const bDecimals = 10;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "003675").add(
      ethers.BigNumber.from(1)
    );
    assert(result.eq(expectedResult));
  });

  it("should scale ratio UP for aDecimals < bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 10;
    const bDecimals = 12;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(
      1 + tenZeros + "00367589" + "00"
    );
    assert(result.eq(expectedResult));
  });

  it("should scale ratio UP for aDecimals == bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 12;
    const bDecimals = 12;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "00367589");
    assert(result.eq(expectedResult));
  });

  it("should scale ratio DOWN for aDecimals > bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 12;
    const bDecimals = 10;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "003675");
    assert(result.eq(expectedResult));
  });

  it("should scale ratio DOWN for aDecimals < bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 10;
    const bDecimals = 12;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(
      1 + tenZeros + "00367589" + "00"
    );
    assert(result.eq(expectedResult));
  });

  it("should scale ratio DOWN for aDecimals == bDecimals", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 12;
    const bDecimals = 12;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "00367589");
    assert(result.eq(expectedResult));
  });

  it("should scale ratio by 18 OOM for bDecimals = 0", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 18;
    const bDecimals = 0;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1);
    assert(result.eq(expectedResult));
  });

  it("should scale ratio by 18 OOM for aDecimals = 0", async () => {
    const ratio = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const aDecimals = 0;
    const bDecimals = 18;

    const result = await fixedPointMathTest.scaleRatio(
      ratio,
      aDecimals,
      bDecimals,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(
      1 + tenZeros + "00367589" + eighteenZeros
    );
    assert(result.eq(expectedResult));
  });

  // Scale Down

  it("should scale down by specified decimals and round UP", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleDownBy = 2;

    const result = await fixedPointMathTest.scaleDown(
      a_,
      scaleDownBy,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale down by specified decimals and round UP", async () => {
    const a_ = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const scaleDownBy = 2;

    const result = await fixedPointMathTest.scaleDown(
      a_,
      scaleDownBy,
      ROUND_UP
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "003675").add(
      ethers.BigNumber.from(1)
    );
    assert(result.eq(expectedResult));
  });

  it("should scale down by specified decimals and round DOWN", async () => {
    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleDownBy = 2;

    const result = await fixedPointMathTest.scaleDown(
      a_,
      scaleDownBy,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(1 + sixteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale down by specified decimals and round DOWN", async () => {
    const a_ = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const scaleDownBy = 2;

    const result = await fixedPointMathTest.scaleDown(
      a_,
      scaleDownBy,
      ROUND_DOWN
    );
    const expectedResult = ethers.BigNumber.from(1 + tenZeros + "003675");
    assert(result.eq(expectedResult));
  });

  it("should scale down by 18 OOMs", async () => {
    const a_ = ethers.BigNumber.from(1 + tenZeros + "00367589");
    const scaleDownBy = 18;

    const result = await fixedPointMathTest.scaleDown(
      a_,
      scaleDownBy,
      ROUND_TO_ZERO
    );
    const expectedResult = ethers.BigNumber.from(1);
    assert(result.eq(expectedResult));
  });
});
