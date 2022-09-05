import { assert } from "chai";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain";
import { assertError } from "../../../utils/test/assertError";

const SENTINEL_HIGH_BITS =
  "0xF000000000000000000000000000000000000000000000000000000000000000";

describe("LibStackTop consumeSentinel tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should search for a sentinel at the given stepSize", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);

    const array0 = [1, 2, SENTINEL, SENTINEL, 5, 6];

    await libStackTop.consumeSentinel(array0, SENTINEL, 2);
    await libStackTop.consumeSentinel(array0, SENTINEL, 3);

    const array1 = [1, 2, SENTINEL, 4, 5, 6];

    await assertError(
      async () => await libStackTop.consumeSentinel(array1, SENTINEL, 2),
      "",
      "did not revert when no sentinel was found"
    );
    await libStackTop.consumeSentinel(array1, SENTINEL, 3);

    const array2 = [1, 2, 3, SENTINEL, 5, 6];

    await libStackTop.consumeSentinel(array2, SENTINEL, 2);
    await assertError(
      async () => await libStackTop.consumeSentinel(array2, SENTINEL, 3),
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
      async () => await libStackTop.consumeSentinel(array, SENTINEL, stepSize),
      "",
      "did not revert when no sentinel was found"
    );
  });

  it("should consume a sentinel, returning an starting array from the sentinel position", async () => {
    const SENTINEL = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const array = [1, 2, SENTINEL, 4, 5, 6];
    const stepSize = 1;

    const { stackTopSentinel_, arraySentinel_, stackBottom_ } =
      await libStackTop.consumeSentinel(array, SENTINEL, stepSize);

    assert(stackTopSentinel_.eq(stackBottom_.add(3 * 32)));
    assert(arraySentinel_[0].eq(array[3]));
    assert(arraySentinel_[1].eq(array[4]));
    assert(arraySentinel_[2].eq(array[5]));
  });
});
