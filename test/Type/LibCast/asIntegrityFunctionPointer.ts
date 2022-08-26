import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain/LibCastTest";
import { randomUint256 } from "../../../utils/bytes";

describe("LibCast asIntegrityFunctionPointer tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
  });

  it("retypes an integer to an integrity function pointer without corrupting memory", async function () {
    const tx_ = await libCast.asIntegrityFunctionPointer(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes an array of integers to integrity function pointers without corrupting memory", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asIntegrityPointers([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });
});
