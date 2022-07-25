import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain/LibCastTest";
import { randomUint256 } from "../../../utils/bytes";

describe("LibCast tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
  });

  it("retypes an array of integers to an array of addresses without corrupting memory", async function () {
    const tx_ = await libCast.asAddresses([
      randomUint256(),
      randomUint256(),
      randomUint256(),
      randomUint256(),
    ]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes an array of op function pointers to an array of integers without corrupting memory", async function () {
    const tx_ = await libCast.opFnsAsUint256Array([
      randomUint256(),
      randomUint256(),
      randomUint256(),
      randomUint256(),
    ]);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes a stack move function pointer to an integer without corrupting memory", async function () {
    const tx_ = await libCast.opFnAsUint256(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes a boolean to an integer without corrupting memory", async function () {
    const tx0_ = await libCast.boolAsUint256(false);
    const tx1_ = await libCast.boolAsUint256(true);

    const { data: memDumpBefore0_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter0_ } = (await tx0_.wait()).events[1];
    const { data: memDumpBefore1_ } = (await tx1_.wait()).events[0];
    const { data: memDumpAfter1_ } = (await tx1_.wait()).events[1];

    assert(memDumpBefore0_ === memDumpAfter0_, "cast corrupted memory");
    assert(memDumpBefore1_ === memDumpAfter1_, "cast corrupted memory");
  });

  it("retypes a stack move function pointer to an integer without corrupting memory", async function () {
    const tx_ = await libCast.stackMoveFnAsUint256(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes an integer to a stack move function pointer without corrupting memory", async function () {
    const tx_ = await libCast.asStackMoveFn(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });

  it("retypes an integer to an opcode function pointer without corrupting memory", async function () {
    const tx_ = await libCast.asOpFn(randomUint256());

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "cast corrupted memory");
  });
});
