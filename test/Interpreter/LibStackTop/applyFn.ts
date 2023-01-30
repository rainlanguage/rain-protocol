import { assert } from "chai";
import type { LibStackPointerTest } from "../../../typechain";
import { assertError } from "../../../utils";
import { readBytes, zeroPad32 } from "../../../utils/bytes";
import { libStackPointerDeploy } from "../../../utils/deploy/test/libStackTop/deploy";

describe("LibStackPointer applyFn tests", async function () {
  let libStackPointer: LibStackPointerTest;

  before(async () => {
    libStackPointer = await libStackPointerDeploy();
  });

  it("should applyFn for `function(uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];

    const stackTop_ = await libStackPointer.callStatic["applyFn(uint256[])"](
      array0
    );

    const tx0_ = await libStackPointer["applyFn(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    assert(
      bytes_ === zeroPad32(array0.slice(-1)[0] * 2),
      `did not apply double function correctly
      expected  ${zeroPad32(array0.slice(-1)[0] * 2)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(Operand, uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];
    const operand = 3;

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn(uint256[],uint256)"
    ](array0, operand);

    const tx0_ = await libStackPointer["applyFn(uint256[],uint256)"](
      array0,
      operand
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    assert(
      bytes_ === zeroPad32(array0.slice(-1)[0] * operand),
      `did not apply multiplier function correctly
      expected  ${zeroPad32(array0.slice(-1)[0] * operand)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(uint256, uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];

    const stackTop_ = await libStackPointer.callStatic[
      "applyFnSummer(uint256[])"
    ](array0);

    const tx0_ = await libStackPointer["applyFnSummer(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const a_ = array0.slice(-1)[0];
    const b_ = array0.slice(-2)[0];

    assert(
      bytes_ === zeroPad32(a_ + b_),
      `did not apply summation function correctly
      expected  ${zeroPad32(a_ + b_)}
      got       ${bytes_}`
    );
  });

  it("should applyFnN for `function(uint256, uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];

    const stackTop_ = await libStackPointer.callStatic[
      "applyFnNSummer(uint256[],uint256)"
    ](array0, array0.length);

    const tx0_ = await libStackPointer["applyFnNSummer(uint256[],uint256)"](
      array0,
      array0.length
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFnN did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const expectedSum = array0.reduce((prev, next) => prev + next);

    assert(
      bytes_ === zeroPad32(expectedSum),
      `did not apply reducer correctly
      expected  ${zeroPad32(expectedSum)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(uint256, uint256, uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn3Summer(uint256[])"
    ](array0);

    const tx0_ = await libStackPointer["applyFn3Summer(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const a_ = array0.slice(-1)[0];
    const b_ = array0.slice(-2)[0];
    const c_ = array0.slice(-3)[0];

    assert(
      bytes_ === zeroPad32(a_ + b_ + c_),
      `did not apply summation of 3 values function correctly
      expected  ${zeroPad32(a_ + b_ + c_)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(Operand, uint256, uint256) internal view returns (uint256)`", async () => {
    const array0 = [5, 6, 7, 8];
    const operand = 3;

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn2Operand(uint256[],uint256)"
    ](array0, operand);

    const tx0_ = await libStackPointer["applyFn2Operand(uint256[],uint256)"](
      array0,
      operand
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const a_ = array0.slice(-1)[0];
    const b_ = array0.slice(-2)[0];

    assert(
      bytes_ === zeroPad32((a_ + b_) * operand),
      `did not apply function correctly
      expected  ${zeroPad32((a_ + b_) * operand)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(uint256, uint256, uint256[] memory) internal view returns (uint256)`", async () => {
    const array0 = [2, 4, 6, 8, 10, 12, 14, 16];
    const tailLength = 6;

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn2Heads(uint256[],uint256)"
    ](array0, tailLength);

    const tx0_ = await libStackPointer["applyFn2Heads(uint256[],uint256)"](
      array0,
      tailLength
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const a_ = array0[0];
    const b_ = array0[1];
    const tail_ = array0.slice(2);

    const expectedResult =
      (a_ + b_) * tail_.reduce((prev, next) => prev + next);

    assert(
      bytes_ === zeroPad32(expectedResult),
      `did not apply function correctly
      expected  ${zeroPad32(expectedResult)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(uint256, uint256, uint256, uint256[] memory) internal view returns (uint256)`", async () => {
    const array0 = [2, 4, 6, 8, 10, 12, 14, 16];
    const tailLength = 5;

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn3Heads(uint256[],uint256)"
    ](array0, tailLength);

    const tx0_ = await libStackPointer["applyFn3Heads(uint256[],uint256)"](
      array0,
      tailLength
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32,
      stackTop_.toNumber()
    );

    const a_ = array0[0];
    const b_ = array0[1];
    const c_ = array0[2];
    const tail_ = array0.slice(3);

    const expectedResult =
      (a_ + b_ + c_) * tail_.reduce((prev, next) => prev + next);

    assert(
      bytes_ === zeroPad32(expectedResult),
      `did not apply function correctly
      expected  ${zeroPad32(expectedResult)}
      got       ${bytes_}`
    );
  });

  it("should applyFn for `function(uint256, uint256[] memory, uint256[] memory) internal view returns (uint256[] memory)`", async () => {
    const array0 = [2, 4, 6, 8, 10, 12, 14, 16, 18];
    const tailLength = 4;

    const stackTop_ = await libStackPointer.callStatic[
      "applyFn2Tails(uint256[],uint256)"
    ](array0, tailLength);

    const tx0_ = await libStackPointer["applyFn2Tails(uint256[],uint256)"](
      array0,
      tailLength
    );
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ !== memDumpAfter_, "applyFn did not modify memory");

    // read the top value on the stack
    const bytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - 32 * tailLength,
      stackTop_.toNumber()
    );

    const a_ = array0[0];

    const expectedResults = array0.slice(1, tailLength + 1).map((b_, i_) => {
      const c_ = array0[i_ + tailLength + 1];
      return b_ * c_ + a_;
    });

    for (let i_ = 0; i_ < tailLength; i_++) {
      const result_ = readBytes(bytes_, 32 * i_, 32 * (i_ + 1));

      assert(
        result_ === zeroPad32(expectedResults[i_]),
        `did not apply function correctly
        expected  ${zeroPad32(expectedResults[i_])}
        got       ${result_}`
      );
    }
  });


  it("should throw error when the length of an array as the result of an applied function does not match expectations", async () => {
    const array0 = [2, 4, 6, 8, 10, 12, 14, 16, 18];
    const tailLength = 4;

    assertError(
      async () => await libStackPointer.callStatic.applyFn2TailsWithErrorFn(array0, tailLength),
      "UnexpectedResultLength",
      "Did not error when the length of an array as the result of the applied function did not matched the expectations"
    );

  });
});
