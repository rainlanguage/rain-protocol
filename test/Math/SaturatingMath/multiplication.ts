import * as Util from "../../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";

import type { SaturatingMathTest } from "../../../typechain/SaturatingMathTest";

let saturatingMathTestFactory: ContractFactory;

describe("SaturatingMathTest", async function () {
  before(async () => {
    saturatingMathTestFactory = await ethers.getContractFactory(
      "SaturatingMathTest"
    );
  });

  it("should return expected multiplication within typical (non-overflowing) bounds", async () => {
    this.timeout(0);

    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest &
        Contract;

    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingMul(a_, b_);

    assert(result.eq(a_ * b_));
  });

  it("should return saturated multiplication when operation would overflow", async () => {
    this.timeout(0);

    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest &
        Contract;

    const a_ = Util.max_uint256;
    const b_ = 3;

    const result = await saturatingMathTest.saturatingMul(a_, b_);

    assert(result.eq(Util.max_uint256));
  });
});
