import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

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
});
