import * as Util from "../../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";

import type { SaturatingMathTest } from "../../../typechain/SaturatingMathTest";

let saturatingMathTestFactory: ContractFactory;

describe("SaturatingMathTest subtraction test", async function () {
  before(async () => {
    saturatingMathTestFactory = await ethers.getContractFactory(
      "SaturatingMathTest"
    );
  });

  it("should return expected subtraction within typical (non-underflowing) bounds", async () => {
    this.timeout(0);

    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest &
        Contract;

    const a_ = 42;
    const b_ = 9;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(a_ - b_));
  });
  
  it("should return saturated subtraction when operation would underflow", async () => {
    this.timeout(0);

    const saturatingMathTest =
      (await saturatingMathTestFactory.deploy()) as SaturatingMathTest &
        Contract;

    const a_ = 9;
    const b_ = 42;

    const result = await saturatingMathTest.saturatingSub(a_, b_);

    assert(result.eq(0));
  });

});
