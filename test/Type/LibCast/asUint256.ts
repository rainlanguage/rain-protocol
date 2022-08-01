import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain/LibCastTest";
import { randomUint256 } from "../../../utils/bytes";

describe("LibCast asUint256 tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
  });

  it("retypes `function(uint256) view returns (uint256)` to uint256 pointer", async function () {
    const tx_ = await libCast.asUint256_uint256();

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256_uint256();
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes integrity function to uint256 pointer", async function () {
    const randomNum = randomUint256();

    const tx_ = await libCast.asUint256_intPtr([randomNum]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256_intPtr([randomNum]);
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes array of integrity functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256Array_intPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256Array_intPtrs([
      ...randomNums,
    ]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });

  it("retypes boolean to uint256 pointer", async function () {
    const tx0_ = await libCast.asUint256_bool(false);
    const tx1_ = await libCast.asUint256_bool(true);

    const { data: memDumpBefore0_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter0_ } = (await tx0_.wait()).events[1];
    assert(memDumpBefore0_ === memDumpAfter0_, "cast corrupted memory");

    const { data: memDumpBefore1_ } = (await tx1_.wait()).events[0];
    const { data: memDumpAfter1_ } = (await tx1_.wait()).events[1];
    assert(memDumpBefore1_ === memDumpAfter1_, "cast corrupted memory");

    const i0_ = await libCast.callStatic.asUint256_bool(false);
    assert(i0_.eq(0), "did not return 0");

    const i1_ = await libCast.callStatic.asUint256_bool(true);
    assert(i1_.eq(1), "did not return 1");
  });

  it("retypes eval function to uint256 pointer", async function () {
    const tx_ = await libCast.asUint256_evalPtr(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const i_ = await libCast.callStatic.asUint256_evalPtr(randomUint256());
    assert(!i_.isZero(), "did not point to a function");
  });

  it("retypes array of `function(uint256) view returns (uint256)` to array of uint256 pointers", async function () {
    const array = [0, 0, 0];

    const is_ = await libCast.callStatic.asUint256Array_uint256([...array]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });

  it("retypes array of op functions to array of uint256 pointers", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const tx_ = await libCast.asUint256Array_opPtrs([...randomNums]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];
    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");

    const is_ = await libCast.callStatic.asUint256Array_opPtrs([...randomNums]);
    is_.forEach((i_) => {
      assert(!i_.isZero(), "did not point to a function");
    });
  });
});
