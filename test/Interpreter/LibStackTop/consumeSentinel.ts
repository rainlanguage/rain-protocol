import { strict as assert } from "assert";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackPointerTest } from "../../../typechain";
import { SENTINEL_HIGH_BITS } from "../../../utils/constants/sentinel";
import { libStackPointerDeploy } from "../../../utils/deploy/test/libStackTop/deploy";
import { assertError } from "../../../utils/test/assertError";

describe("LibStackPointer consumeSentinel tests", async function () {
  let libStackPointer: LibStackPointerTest;

  before(async () => {
    libStackPointer = await libStackPointerDeploy();
  });

  it("should consume sentinels successively with different step sizes", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const array = [1, 2, SENTINEL, 4, 5, 6, SENTINEL, 8, 9];
    const stepSize0 = 2;
    const stepSize1 = 3;

    const {
      stackTopSentinel_,
      arraySentinel0_,
      arraySentinel1_,
      stackBottom_,
      stackTop_,
    } = await libStackPointer.consumeSentinels(
      array,
      SENTINEL,
      stepSize0,
      stepSize1
    );

    assert(stackTopSentinel_.eq(stackTop_.sub(7 * 32)));
    assert(stackTopSentinel_.eq(stackBottom_.add(3 * 32)));
    assert(arraySentinel0_[0].eq(array[7]));
    assert(arraySentinel0_[1].eq(array[8]));
    assert(arraySentinel1_[0].eq(array[3]));
    assert(arraySentinel1_[1].eq(array[4]));
    assert(arraySentinel1_[2].eq(array[5]));
  });

  it("should consume sentinels successively", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const array = [1, 2, SENTINEL, 4, 5, 6, SENTINEL, 8, 9];
    const stepSize0 = 1;
    const stepSize1 = 1;

    const {
      stackTopSentinel_,
      arraySentinel0_,
      arraySentinel1_,
      stackBottom_,
      stackTop_,
    } = await libStackPointer.consumeSentinels(
      array,
      SENTINEL,
      stepSize0,
      stepSize1
    );

    assert(stackTopSentinel_.eq(stackTop_.sub(7 * 32)));
    assert(stackTopSentinel_.eq(stackBottom_.add(3 * 32)));
    assert(arraySentinel0_[0].eq(array[7]));
    assert(arraySentinel0_[1].eq(array[8]));
    assert(arraySentinel1_[0].eq(array[3]));
    assert(arraySentinel1_[1].eq(array[4]));
    assert(arraySentinel1_[2].eq(array[5]));
  });

  it("should search for a sentinel at the given stepSize", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);

    const array0 = [1, 2, SENTINEL, SENTINEL, 5, 6];

    await libStackPointer.consumeSentinel(array0, SENTINEL, 2);
    await libStackPointer.consumeSentinel(array0, SENTINEL, 3);

    const array1 = [1, 2, SENTINEL, 4, 5, 6];

    await assertError(
      async () => await libStackPointer.consumeSentinel(array1, SENTINEL, 2),
      "",
      "did not revert when no sentinel was found"
    );
    await libStackPointer.consumeSentinel(array1, SENTINEL, 3);

    const array2 = [1, 2, 3, SENTINEL, 5, 6];

    await libStackPointer.consumeSentinel(array2, SENTINEL, 2);
    await assertError(
      async () => await libStackPointer.consumeSentinel(array2, SENTINEL, 3),
      "",
      "did not revert when no sentinel was found"
    );
  });

  it("should revert if no sentinel found in stack range (e.g. between top and bottom of `array`)", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const array = [1, 2, 3, 4, 5, 6];
    const stepSize = 1;

    await assertError(
      async () =>
        await libStackPointer.consumeSentinel(array, SENTINEL, stepSize),
      "",
      "did not revert when no sentinel was found"
    );
  });

  it("should consume a sentinel, returning an array starting from the sentinel position", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const array = [1, 2, SENTINEL, 4, 5, 6];

    // step from top of array working backwards
    const stepSize = 3; // 1 would also work

    const { stackTopSentinel_, arraySentinel_, stackBottom_, stackTop_ } =
      await libStackPointer.consumeSentinel(array, SENTINEL, stepSize);

    assert(stackTopSentinel_.eq(stackTop_.sub(4 * 32)));
    assert(stackTopSentinel_.eq(stackBottom_.add(3 * 32)));
    assert(arraySentinel_[0].eq(array[3]));
    assert(arraySentinel_[1].eq(array[4]));
    assert(arraySentinel_[2].eq(array[5]));
  });
});
