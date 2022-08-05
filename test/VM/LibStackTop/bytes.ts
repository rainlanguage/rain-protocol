import { assert } from "chai";
import { arrayify, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";
import { hexConcat, readBytes, zeroPad32 } from "../../../utils/bytes";
import { range } from "../../../utils/range";

describe("LibStackTop bytes tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
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

    const stackTop0_ = await libStackTop.callStatic["peekStackTop(bytes)"](
      array0
    );
    const tx0_ = await libStackTop["peekStackTop(bytes)"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "peek corrupted memory");

    // read bytes starting from stack top to the end of allocated memory
    const bytes0_ = readBytes(memDumpAfter_, stackTop0_.toNumber());

    console.log({ bytes0_ });

    // bytes0_ should begin 1 byte of zeroes, followed by array length
    assert(
      readBytes(bytes0_, 0, 33) === hexConcat("0x00", zeroPad32(array0.length))
    );

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

    assert(a_.eq(array0.length), "a_ should be the value that was read");
    assert(
      stackTopAfter_.eq(128), // in this case, pointer happens to start at the 4th byte
      "stackTopAfter_ pointer should be defined (for the value that was read)"
    );
  });

  it("should set", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
    const value0 = 6;

    // set a new array length
    const tx0_ = await libStackTop["set(bytes,uint256,uint256)"](
      array0,
      value0,
      0 // no shift up, we are writing over array size value
    );

    // assert(newArray0_.length === value0);
    // for (let i = 0; i < value0; i++) {
    //   assert(array0[i] === newArray0_[i]);
    // }
  });

  // xit("should push bytes unaligned", async function () {
  //   const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
  //   const bytes1 = Uint8Array.from([6, 7]);

  //   const bytes0_ = await libStackTop.callStatic["unalignedPush(bytes,bytes)"](
  //     array0,
  //     bytes1
  //   );

  //   const newArray0_ = arrayify(bytes0_);

  //   console.log({ array0, bytes1, newArray0_ });
  // });

  // xit("should push bytes unaligned with length", async function () {
  //   const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);
  //   const bytes1 = Uint8Array.from([6, 7]);

  //   const bytes0_ = await libStackTop.callStatic[
  //     "unalignedPushWithLength(bytes,bytes)"
  //   ](array0, bytes1);

  //   const newArray0_ = arrayify(bytes0_);

  //   console.log({ array0, bytes1, newArray0_ });
  // });
});
