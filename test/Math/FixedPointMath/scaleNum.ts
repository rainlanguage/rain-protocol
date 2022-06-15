import { assert } from "chai";
import type { ContractFactory } from "ethers";
import { ethers } from "hardhat";

import type { FixedPointMathTest } from "../../../typechain/FixedPointMathTest";
import { eighteenZeros, sixZeros, tenZeros } from "../../../utils";

let fixedPointMathTestFactory: ContractFactory;

describe("FixedPointMathTest scaling a number", async function () {
  before(async () => {
    fixedPointMathTestFactory = await ethers.getContractFactory(
      "FixedPointMathTest"
    );
  });

  // Scale 18
  it("should scale a fixed point decimal UP to scale 18", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + sixZeros);
    const aDecimals_ = 8; // 0.01

    const result = await fixedPointMathTest.scale18(a_, aDecimals_);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + tenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale 18", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + eighteenZeros + sixZeros);
    const aDecimals_ = 24; // 1.0

    const result = await fixedPointMathTest.scale18(a_, aDecimals_);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 0 order of magnitude decimal to scale 18", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1);
    const aDecimals_ = 0; // 1.0

    const result = await fixedPointMathTest.scale18(a_, aDecimals_);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });

  // Scale N
  it("should scale a fixed point decimal UP to scale N", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 20;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN to scale N", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const targetDecimals_ = 8;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 OOM in situ [scaleN]", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1);
    const targetDecimals_ = 18;

    const result = await fixedPointMathTest.scaleN(a_, targetDecimals_);
    const expectedResult = ethers.BigNumber.from(1);
    assert(result.eq(expectedResult));
  });

  // Scale By
  it("should scale a fixed point decimal UP by scale N", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros + "00");
    assert(result.eq(expectedResult));
  });

  it("should scale a fixed point decimal DOWN by scale N", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + sixZeros + "00");
    const scaleBy_ = -2;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_);
    const expectedResult = ethers.BigNumber.from(1 + sixZeros);
    assert(result.eq(expectedResult));
  });

  it("should scale a 18 order of magnitude decimal by scale 0", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;

    const a_ = ethers.BigNumber.from(1 + eighteenZeros);
    const scaleBy_ = 0;

    const result = await fixedPointMathTest.scaleBy(a_, scaleBy_);
    const expectedResult = ethers.BigNumber.from(1 + eighteenZeros);
    assert(result.eq(expectedResult));
  });
});
