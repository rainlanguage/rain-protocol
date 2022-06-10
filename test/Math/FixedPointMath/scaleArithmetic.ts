import { assert } from "chai";
import { ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";

import type { FixedPointMathTest } from "../../../typechain/FixedPointMathTest";
import { eighteenZeros, ONE } from "../../../utils";

let fixedPointMathTestFactory: ContractFactory;

describe("FixedPointMathTest scaling during arithmetic op", async function () {
  before(async () => {
    fixedPointMathTestFactory = await ethers.getContractFactory(
      "FixedPointMathTest"
    );
  });

  it("should scale a number by 18 order of magnitude while multiplying", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest &
      Contract;

    const a_ = 5;
    const b_ = ONE.mul(2);

    const result = await fixedPointMathTest.fixedPointMul(a_, b_);
    const expectedResult = ethers.BigNumber.from(a_).mul(b_).div(ONE)

    assert(result.eq(expectedResult));
  });

  it("should scale a number by 18 order of magnitude while dividing", async () => {
    this.timeout(0);

    const fixedPointMathTest =
      (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest &
      Contract;

    const a_ = 60;
    const b_ = ethers.BigNumber.from("2"+ eighteenZeros);

    const result = await fixedPointMathTest.fixedPointDiv(a_, b_);
    const expectedResult = ethers.BigNumber.from(a_).mul(ONE).div(b_)

    assert(result.eq(expectedResult));
  });
});
