import { assert } from "chai";
import type { ContractFactory } from "ethers";
import { ethers } from "hardhat";

import type { SaturatingMathTest } from "../../../typechain";

let saturatingMathTestFactory: ContractFactory;

describe("SaturatingMathTest subtraction test", async function () {
  before(async () => {
    saturatingMathTestFactory = await ethers.getContractFactory(
      "SaturatingMathTest"
    );
  });

  it("should return expected subtraction within typical (non-underflowing) bounds", async () => {
    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest;

    const a_ = 42;
    const b_ = 9;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(a_ - b_));
  });

  it("should return saturated subtraction when operation would underflow", async () => {
    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest;

    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(0));
  });
});
