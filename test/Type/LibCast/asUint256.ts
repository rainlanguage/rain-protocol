import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain/LibCastTest";

describe("LibCast asUint256 tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
  });

  it("retypes `function(uint256) view returns (uint256)` to uint256", async function () {
    const tx_ = await libCast.asUint256();

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256();
    assert(!i_.isZero(), "did not point to a function");
  });
});
