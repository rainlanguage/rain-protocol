import { assert } from "chai";
import type { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import * as Util from "../../../utils";

import type { SaturatingMathTest } from "../../../typechain";

let saturatingMathTestFactory: ContractFactory;

describe("SaturatingMathTest multiplication test", async function () {
  before(async () => {
    saturatingMathTestFactory = await ethers.getContractFactory(
      "SaturatingMathTest"
    );
  });

  it("should return expected multiplication within typical (non-overflowing) bounds", async () => {
    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest;

    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingMul(a_, b_);

    assert(result.eq(a_ * b_));
  });

  it("should return saturated multiplication when operation would overflow", async () => {
    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest;

    const a_ = Util.max_uint256;
    const b_ = 3;

    const result = await saturatingMathTest.saturatingMul(a_, b_);

    assert(result.eq(Util.max_uint256));
  });
});
