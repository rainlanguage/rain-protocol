import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

xdescribe("LibStackTop uint array tests", async function () {
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

    assert(a_.eq(array0.length), "a_ should be the value that was read");
    assert(
      stackTopAfter_.eq(128), // in this case, pointer happens to start at the 4th byte
      "stackTopAfter_ pointer should be defined (for the value that was read)"
    );
  });

  it("should set", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const value0 = 6;

    // set a new value for position 0 in the array
    const tx0_ = await libStackTop["set(uint256[],uint256,uint256)"](
      array0,
      value0,
      1 // shift up past array size value
    );

    // assert(newArray0_.length === array0.length);
    // assert(!newArray0_[0].eq(array0[0]));
    // assert(newArray0_[0].eq(value0));
    // for (let i = 1; i < array0.length; i++) {
    //   newArray0_[i].eq(array0[i]);
    // }
  });

  xit("should push a value", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const value0 = 6;

    const newArray0_ = await libStackTop.callStatic[
      "pushReturnOriginalStackTop(uint256[],uint256,uint256)"
    ](
      array0,
      value0,
      1 // shift up past array size value
    );

    assert(newArray0_.length === array0.length);
    assert(!newArray0_[0].eq(array0[0]));
    assert(newArray0_[0].eq(value0));
    for (let i = 1; i < array0.length; i++) {
      newArray0_[i].eq(array0[i]);
    }
  });

  it("should push a value and return stack top above where value was written", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const value0 = 6;

    const stackTop_ = await libStackTop.callStatic[
      "push(uint256[],uint256,uint256)"
    ](
      array0,
      value0,
      1 // shift up past array size value
    );

    // // should return stack top above where value was written
    // assert(newArray0_.length === array0[1]); // first value treated as array length, in this case = 20
    // assert(newArray0_[0].eq(array0[2]));
    // assert(newArray0_[1].eq(array0[3]));
    // assert(newArray0_[2].eq(array0[4]));
    // assert(newArray0_[3].eq(array0[5]));
    // assert(newArray0_[4].eq(array0[6]));
    // assert(newArray0_[5].eq(array0[7]));
  });

  xit("should push an array of values", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7];

    const newArray0_ = await libStackTop.callStatic[
      "pushReturnOriginalStackTop(uint256[],uint256[],uint256)"
    ](
      array0,
      values0,
      1 // shift up past array size value
    );

    assert(newArray0_.length === array0.length);
    assert(!newArray0_[0].eq(array0[0]));
    assert(!newArray0_[1].eq(array0[1]));
    assert(newArray0_[0].eq(values0[0]));
    assert(newArray0_[1].eq(values0[1]));
    for (let i = 2; i < array0.length; i++) {
      newArray0_[i].eq(array0[i]);
    }
  });

  it("should push an array of values and return stack top above where values were written", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7];

    const stackTop_ = await libStackTop.callStatic[
      "push(uint256[],uint256[],uint256)"
    ](
      array0,
      values0,
      1 // shift up past array size value
    );

    // // should return stack top above where value was written
    // assert(newArray0_.length === array0[2]); // first value treated as array length, in this case = 30
    // assert(newArray0_[0].eq(array0[3]));
    // assert(newArray0_[1].eq(array0[4]));
    // assert(newArray0_[2].eq(array0[5]));
    // assert(newArray0_[3].eq(array0[6]));
    // assert(newArray0_[4].eq(array0[7]));
  });

  xit("should push an array of values with length", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7];

    const newArray0_ = await libStackTop.callStatic[
      "pushWithLengthReturnOriginalStackTop(uint256[],uint256[],uint256)"
    ](
      array0,
      values0,
      0 // no shift
    );

    assert(newArray0_.length === values0.length);
    for (let i = 0; i < values0.length; i++) {
      assert(newArray0_[i].eq(values0[i]));
    }
  });

  it("should push an array of values with length and return stack top above where values were written", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];
    const values0 = [6, 7];

    const stackTop_ = await libStackTop.callStatic.pushWithLength(
      array0,
      values0,
      0 // no shift
    );

    // // should return stack top above where value was written
    // assert(newArray0_.length === array0[values0.length]); // first value treated as array length, in this case = 30
  });
});
