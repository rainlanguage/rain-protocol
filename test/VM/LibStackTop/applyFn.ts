import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

describe("LibStackTop applyFn tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should applyFn for `function(uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];

    const stackTop_ = await libStackTop.callStatic["applyFn(uint256[])"](
      array0
    );

    const tx0_ = await libStackTop["applyFn(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    console.log({ stackTop_, memDumpBefore_, memDumpAfter_ });
  });
});
