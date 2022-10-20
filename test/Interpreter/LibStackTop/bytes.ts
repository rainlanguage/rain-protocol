import { assert } from "chai";
import { arrayify, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain";
import { readBytes, zeroPad32 } from "../../../utils/bytes";
import { libStackTopDeploy } from "../../../utils/deploy/test/libStackTop/deploy";
import { range } from "../../../utils/range";

describe("LibStackTop bytes tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    libStackTop = await libStackTopDeploy();
  });

  it("should peek up", async function () {
    // get first 32 bytes
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const a0_ = await libStackTop.callStatic["peekUp(bytes)"](array0);

    assert(a0_.eq(array0.length));

    const stackTop0_ = await libStackTop.callStatic["peekUpStackTop(bytes)"](
      array0
    );
    const tx0_ = await libStackTop["peekUpStackTop(bytes)"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peekUp corrupted memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytes0_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes0_ should begin with array length as uint256
    assert(readBytes(bytes0_, 0, 32) === zeroPad32(array0.length));

    // then followed by array0.length 1-byte elements
    array0.forEach((element_, i_) => {
      assert(hexlify(element_) === readBytes(bytes0_, 32 + i_, 33 + i_));
    });
  });

  it("should peek 32 byte chunks", async function () {
    const array0 = Uint8Array.from(range(1, 48));

    const a0_ = await libStackTop.callStatic["peekUp(bytes)"](array0);

    assert(a0_.eq(array0.length));

    // get first 32 bytes
    const a1_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      1
    );

    assert(arrayify(a1_).length === 32, "did not return 32 byte chunk");
    assert(
      arrayify(a1_)[31] === array0[31],
      "final byte in 1st chunk is wrong"
    );
    assert(
      arrayify(a1_)[32] === undefined,
      "returned more than 32 bytes in a chunk"
    );

    // get next 32 bytes
    const a2_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      2
    );

    assert(arrayify(a2_)[0] === array0[32], "first byte in 2nd chunk is wrong");
  });

  it("should peek", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const a0_ = await libStackTop.callStatic["peek(bytes)"](array0);

    const tx0_ = await libStackTop["peek(bytes)"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peek corrupted memory");

    assert(a0_.isZero(), "memory should be out of bounds");

    // get first 32 bytes
    const a1_ = await libStackTop.callStatic["peek(bytes,uint256)"](array0, 1);

    assert(a1_.eq(array0.length));

    // get second 32 bytes
    const a2_ = await libStackTop.callStatic["peek(bytes,uint256)"](array0, 2);

    array0.forEach((element_, i_) => {
      assert(
        arrayify(a2_)[i_] === element_,
        `wrong value
        expected  ${element_}
        got       ${arrayify(a2_)[i_]}`
      );
    });
  });

  it("should peek2", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const [a_, b_] = await libStackTop.callStatic["peek2(bytes,uint256)"](
      array0,
      2 // shift up before calling `peek2`
    );
    const tx0_ = await libStackTop["peek2(bytes,uint256)"](array0, 2);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peek2 corrupted memory");

    assert(a_.eq(array0.length));

    array0.forEach((element_, i_) => {
      assert(
        arrayify(b_)[i_] === element_,
        `wrong value
        expected  ${element_}
        got       ${arrayify(b_)[i_]}`
      );
    });
  });

  it("should pop", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const { stackTopAfter_, a_ } = await libStackTop.callStatic[
      "pop(bytes,uint256)"
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
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
    const value0 = 6;

    // set a new array length
    const stackTop0_ = await libStackTop.callStatic[
      "set(bytes,uint256,uint256)"
    ](array0, value0, 0);

    const tx0_ = await libStackTop["set(bytes,uint256,uint256)"](
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

    // then followed by array0.length 1-byte elements
    array0.forEach((element_, i_) => {
      assert(hexlify(element_) === readBytes(bytes0_, 32 + i_, 33 + i_));
    });
  });

  it("should push bytes unaligned", async function () {
    const bytes0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
    const bytes1 = Uint8Array.from([6, 7, 8]);

    const stackTop0_ = await libStackTop.callStatic[
      "unalignedPush(bytes,bytes)"
    ](bytes0, bytes1);

    const tx0_ = await libStackTop["unalignedPush(bytes,bytes)"](
      bytes0,
      bytes1
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "unalignedPush did not modify memory"
    );

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(
      bytesBefore_ === bytesAfter_,
      "unalignedPush corrupted existing stack"
    );

    // unalignedPush should write bytes below stack top, followed by the existing bytes
    const pushedBytes_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - bytes1.length,
      stackTop0_.toNumber()
    );
    const existingBytesArrayLength_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 - bytes1.length
    );
    const existingBytesArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() + 32 - bytes1.length,
      stackTop0_.toNumber() + 32 - bytes1.length + bytes0.length
    );

    assert(pushedBytes_ === hexlify(bytes1), "did not write correct bytes1");
    assert(
      Number(existingBytesArrayLength_) == bytes0.length,
      "did not preserve bytes0 array length"
    );
    assert(
      existingBytesArray_ === hexlify(bytes0),
      "did not preserve bytes0 array"
    );
  });

  it("should push bytes unaligned with length", async function () {
    const bytes0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
    const bytes1 = Uint8Array.from([6, 7, 8]);

    const stackTop0_ = await libStackTop.callStatic[
      "unalignedPushWithLength(bytes,bytes)"
    ](bytes0, bytes1);

    const tx0_ = await libStackTop["unalignedPushWithLength(bytes,bytes)"](
      bytes0,
      bytes1
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "unalignedPushWithLength did not modify memory"
    );

    // read bytes starting from stack top to the end of allocated memory
    const bytesBefore_ = readBytes(memDumpBefore_, stackTop0_.toNumber());
    const bytesAfter_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    // bytes starting from stack top position should be preserved
    assert(
      bytesBefore_ === bytesAfter_,
      "unalignedPushWithLength corrupted existing stack"
    );

    // unalignedPushWithLength should write bytes below stack top, followed by the existing bytes
    const pushedBytesArrayLength_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - bytes1.length - 1,
      stackTop0_.toNumber() - bytes1.length
    );
    const pushedBytesArray_ = readBytes(
      memDumpAfter_,
      stackTop0_.toNumber() - bytes1.length,
      stackTop0_.toNumber()
    );

    assert(
      pushedBytesArrayLength_ === hexlify(bytes1.length),
      "did not push with length"
    );
    assert(
      pushedBytesArray_ === hexlify(bytes1),
      "did not push correct bytes array"
    );
  });

  it("should return bytes as stack top", async () => {
    const bytes = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const stackTop0_ = await libStackTop.callStatic["asStackTop(bytes)"](bytes);

    const tx0_ = await libStackTop["asStackTop(bytes)"](bytes);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "asStackTop corrupted memory");

    const bytes_ = readBytes(
      memDumpBefore_,
      stackTop0_.toNumber(),
      stackTop0_.toNumber() + 32 + bytes.length
    );

    // bytes_ should begin with array length as uint256
    assert(readBytes(bytes_, 0, 32) === zeroPad32(bytes.length));

    // then followed by bytes.length 1-byte elements
    bytes.forEach((element_, i_) => {
      assert(hexlify(element_) === readBytes(bytes_, 32 + i_, 33 + i_));
    });
  });

  it("should return stack top as bytes", async () => {
    const bytes = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const bytes_ = await libStackTop.callStatic["asStackTopAsBytes(bytes)"](
      bytes
    );

    const tx0_ = await libStackTop["asStackTopAsBytes(bytes)"](bytes);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "asBytes corrupted memory");

    assert(
      hexlify(bytes) === bytes_,
      `wrong bytes
      expected  ${hexlify(bytes)}
      got       ${bytes_}`
    );
  });
});
