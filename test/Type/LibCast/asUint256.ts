import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";

describe("LibCast asUint256 tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
  });

  it("retypes `function(uint256) view returns (uint256)` to uint256 pointer", async function () {
    const tx_ = await libCast.asUint256Uint256();

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256Uint256();
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes integrity function to uint256 pointer", async function () {
    const randomNum = randomUint256();

    const tx_ = await libCast.asUint256IntPtr([randomNum]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256IntPtr([randomNum]);
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes array of integrity functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256ArrayIntPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256ArrayIntPtrs([...randomNums]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });

  it("retypes boolean to uint256 pointer", async function () {
    const tx0_ = await libCast.asUint256Bool(false);
    const tx1_ = await libCast.asUint256Bool(true);

    const { data: memDumpBefore0_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter0_ } = (await tx0_.wait()).events[1];
    assert(memDumpBefore0_ === memDumpAfter0_, "cast corrupted memory");

    const { data: memDumpBefore1_ } = (await tx1_.wait()).events[0];
    const { data: memDumpAfter1_ } = (await tx1_.wait()).events[1];
    assert(memDumpBefore1_ === memDumpAfter1_, "cast corrupted memory");

    const i0_ = await libCast.callStatic.asUint256Bool(false);
    assert(i0_.eq(0), "did not return 0");

    const i1_ = await libCast.callStatic.asUint256Bool(true);
    assert(i1_.eq(1), "did not return 1");
  });

  it("retypes eval function to uint256 pointer", async function () {
    const tx_ = await libCast.asUint256EvalPtr(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256EvalPtr(randomUint256());
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes array of `function(uint256) view returns (uint256)` to array of uint256 pointers", async function () {
    const array = [0, 0, 0];

    const is_ = await libCast.callStatic.asUint256ArrayUint256([...array]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });

  it("retypes array of op functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256ArrayOpPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256ArrayOpPtrs([...randomNums]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });
});
