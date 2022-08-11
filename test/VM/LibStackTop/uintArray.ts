import { assert } from "chai";
import { hexConcat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";
import { readBytes, zeroPad32 } from "../../../utils/bytes";
import { Tuple } from "../../../utils/types";

describe("LibStackTop uint array tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should peek up", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];

    const a0_ = await libStackTop.callStatic["peekUp(uint256[])"](array0);

    assert(a0_.eq(array0.length));

    const stackTop0_ = await libStackTop.callStatic[
      "peekUpStackTop(uint256[])"
    ](array0);
    const tx0_ = await libStackTop["peekUpStackTop(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peekUp corrupted memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytes0_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes0_ should begin with array length as uint256
    assert(readBytes(bytes0_, 0, 32) === zeroPad32(array0.length));

    // then followed by array0.length 32-byte elements
    array0.forEach((element_, i_) => {
      assert(
        zeroPad32(element_) === readBytes(bytes0_, 32 + 32 * i_, 64 + 32 * i_),
        `wrong element
        expected  ${zeroPad32(element_)}
        got       ${readBytes(bytes0_, 32 + 32 * i_, 64 + 32 * i_)}`
      );
    });

    array0.forEach(async (element_, i_) => {
      const a_ = await libStackTop.callStatic["peekUp(uint256[],uint256)"](
        array0,
        i_ + 1
      );

      assert(
        a_.eq(element_),
        `wrong value
        expected  ${element_}
        got       ${a_}`
      );
    });
  });

  it("should peek", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];

    const a0_ = await libStackTop.callStatic["peek(uint256[])"](array0);

    const tx0_ = await libStackTop["peek(bytes)"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peek corrupted memory");

    assert(a0_.isZero(), "memory should be out of bounds");

    const a1_ = await libStackTop.callStatic["peek(uint256[],uint256)"](
      array0,
      1
    );

    assert(a1_.eq(array0.length));

    array0.forEach(async (element_, i_) => {
      const a_ = await libStackTop.callStatic["peek(uint256[],uint256)"](
        array0,
        i_ + 2
      );

      assert(
        a_.eq(element_),
        `wrong value
        expected  ${element_}
        got       ${a_}`
      );
    });
  });

  it("should peek2", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];

    const [a_, b_] = await libStackTop.callStatic["peek2(uint256[],uint256)"](
      array0,
      2 // shift up before calling `peek2`
    );

    assert(a_.eq(array0.length));
    assert(b_.eq(array0[0]));
  });

  it("should pop", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];

    const { stackTopAfter_, a_ } = await libStackTop.callStatic[
      "pop(uint256[],uint256)"
    ](
      array0,
      1 // shift up past array size value before calling `pop`
    );

    const tx0_ = await libStackTop["pop(bytes,uint256)"](array0, 1);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "pop corrupted memory");

    // read bytes starting from stackTopAfter_ to the end of allocated memory
    const bytes0_ = readBytes(memDumpAfter_, stackTopAfter_.toNumber());

    // stackTopAfter_ should point to the value, a_, that was read
    assert(
      readBytes(bytes0_, 0, 32) === zeroPad32(a_),
      "stackTopAfter_ did not point to the value that was read"
    );

    assert(a_.eq(array0.length), "a_ is not array length");
  });

  it("should set", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const value0 = 6;

    // set a new array length
    const stackTop0_ = await libStackTop.callStatic[
      "set(uint256[],uint256,uint256)"
    ](array0, value0, 0);

    const tx0_ = await libStackTop["set(uint256[],uint256,uint256)"](
      array0,
      value0,
      0 // no shift up, we are writing over array size value
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "set did not modify memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytes0_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes0_ should begin with new array length as uint256
    assert(readBytes(bytes0_, 0, 32) !== zeroPad32(array0.length));
    assert(readBytes(bytes0_, 0, 32) === zeroPad32(value0));

    // then followed by array0.length 32-byte elements
    array0.forEach((element_, i_) => {
      assert(
        zeroPad32(element_) === readBytes(bytes0_, 32 + 32 * i_, 64 + 32 * i_),
        `wrong element
        expected  ${zeroPad32(element_)}
        got       ${readBytes(bytes0_, 32 + 32 * i_, 64 + 32 * i_)}`
      );
    });
  });

  it("should push a value", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const value0 = 6;

    const stackTop0_ = await libStackTop.callStatic["push(uint256[],uint256)"](
      array0,
      value0
    );

    const tx0_ = await libStackTop["push(uint256[],uint256)"](array0, value0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "push did not modify memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(bytesBefore_ === bytesAfter_, "push corrupted existing stack");

    // push should write value below stack top, followed by the existing bytes
    const pushedValue_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - 32, // writes over existing array length
      stackTop0_.toNumber()
    );
    const existingArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 * array0.length
    );

    assert(pushedValue_ === zeroPad32(value0), "did not write correct value0");

    array0.forEach((element_, i_) => {
      assert(
        zeroPad32(element_) ===
          readBytes(existingArray_, 32 * i_, 32 + 32 * i_),
        `wrong array value
        expected  ${zeroPad32(element_)}
        got       ${readBytes(existingArray_, 32 * i_, 32 + 32 * i_)}`
      );
    });
  });

  it("should push an array", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7, 8];

    const stackTop0_ = await libStackTop.callStatic[
      "push(uint256[],uint256[])"
    ](array0, values0);

    const tx0_ = await libStackTop["push(uint256[],uint256[])"](
      array0,
      values0
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "push did not modify memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(bytesBefore_ === bytesAfter_, "push corrupted existing stack");

    // push should write value below stack top, followed by the existing bytes
    const pushedValues_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - 32 * values0.length, // writes over existing array length and values0.length-1 elements of existing array
      stackTop0_.toNumber()
    );
    const existingArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 * array0.length + 32
    );

    const expectedPushedValues = hexConcat(
      values0.map((value) => zeroPad32(value))
    );

    assert(
      pushedValues_ === expectedPushedValues,
      "did not write correct value0"
    );

    for (let i_ = values0.length - 1; i_ < array0.length; i_++) {
      const element_ = array0[i_];

      const j_ = i_ - values0.length + 1;

      assert(
        zeroPad32(element_) ===
          readBytes(existingArray_, 32 * j_, 32 + 32 * j_),
        `wrong array value
        expected  ${zeroPad32(element_)}
        got       ${readBytes(existingArray_, 32 * j_, 32 + 32 * j_)}`
      );
    }
  });

  it("should push an array with length", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7, 8];

    const stackTop0_ = await libStackTop.callStatic[
      "pushWithLength(uint256[],uint256[])"
    ](array0, values0);

    const tx0_ = await libStackTop["pushWithLength(uint256[],uint256[])"](
      array0,
      values0
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "pushWithLength did not modify memory"
    );

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(
      bytesBefore_ === bytesAfter_,
      "pushWithLength corrupted existing stack"
    );

    // pushWithLength should write value below stack top, followed by the existing bytes
    const pushedLength_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - 32 - 32 * values0.length, // writes over existing array length
      stackTop0_.toNumber() - 32 * values0.length
    );
    const pushedValues_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - 32 * values0.length, // writes over existing values0.length elements of existing array
      stackTop0_.toNumber()
    );
    const existingArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 * array0.length + 32
    );

    assert(pushedLength_ === zeroPad32(values0.length));

    const expectedPushedValues = hexConcat(
      values0.map((value) => zeroPad32(value))
    );

    assert(
      pushedValues_ === expectedPushedValues,
      "did not write correct values0"
    );

    for (let i_ = values0.length; i_ < array0.length; i_++) {
      const element_ = array0[i_];

      const j_ = i_ - values0.length;

      assert(
        zeroPad32(element_) ===
          readBytes(existingArray_, 32 * j_, 32 + 32 * j_),
        `wrong array value
        expected  ${zeroPad32(element_)}
        got       ${readBytes(existingArray_, 32 * j_, 32 + 32 * j_)}`
      );
    }
  });

  it("should push 8 values at once", async function () {
    const array0 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const values0: Tuple<number, 8> = [11, 12, 13, 14, 15, 16, 17, 18];

    const stackTop0_ = await libStackTop.callStatic[
      "push(uint256[],uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
    ](array0, ...values0);

    const tx0_ = await libStackTop[
      "push(uint256[],uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
    ](array0, ...values0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "push did not modify memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(bytesBefore_ === bytesAfter_, "push corrupted existing stack");

    // push should write value below stack top, followed by the existing bytes
    const pushedValues_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - 32 * values0.length, // writes over existing array length and values0.length-1 elements of existing array
      stackTop0_.toNumber()
    );
    const existingArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 * array0.length + 32
    );

    const expectedPushedValues = hexConcat(
      values0.map((value) => zeroPad32(value))
    );

    assert(
      pushedValues_ === expectedPushedValues,
      `did not write correct values0
      expected  ${expectedPushedValues}
      got       ${pushedValues_}`
    );

    for (let i_ = values0.length - 1; i_ < array0.length; i_++) {
      const element_ = array0[i_];

      const j_ = i_ - values0.length + 1;

      assert(
        zeroPad32(element_) ===
          readBytes(existingArray_, 32 * j_, 32 + 32 * j_),
        `wrong array value
        expected  ${zeroPad32(element_)}
        got       ${readBytes(existingArray_, 32 * j_, 32 + 32 * j_)}`
      );
    }
  });

  it("should make a list from existing bytes by writing an array length", async () => {
    const array0 = [10, 20, 30, 40, 50];
    const length0 = 3;

    const { head_, tail_ } = await libStackTop.callStatic[
      "list(uint256[],uint256)"
    ](array0, length0);

    const tx0_ = await libStackTop["list(uint256[],uint256)"](array0, length0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "list did not modify memory");

    assert(head_.eq(array0.length), "head was not original array length");

    assert(tail_.length === length0, "tail was not new length");

    tail_.forEach((value, i_) => {
      assert(value.eq(array0[i_]), "wrong tail value");
    });
  });
});
