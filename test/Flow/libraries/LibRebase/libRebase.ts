import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibRebaseTest } from "../../../../typechain";
import { ONE } from "../../../../utils/constants/bigNumber";

describe("LibRebase tests", async function () {
  let libRebase: LibRebaseTest;

  before(async () => {
    const libRebaseFactory = await ethers.getContractFactory("LibRebaseTest");
    libRebase = (await libRebaseFactory.deploy()) as LibRebaseTest;
  });

  it("should rebase output", async function () {
    const output = 60;
    const ratio = ONE.mul(2);

    const rebased_ = await libRebase.rebaseOutput(output, ratio);
    const expectedResult = ethers.BigNumber.from(output).mul(ratio).div(ONE);

    assert(rebased_.eq(expectedResult));
  });

  it("should rebase input", async function () {
    const input = 60;
    const ratio = ONE.mul(2);

    const rebased_ = await libRebase.rebaseInput(input, ratio);
    const expectedResult = ethers.BigNumber.from(input).mul(ONE).div(ratio);

    assert(rebased_.eq(expectedResult));
  });
});
