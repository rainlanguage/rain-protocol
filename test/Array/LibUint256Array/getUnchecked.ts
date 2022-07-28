import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibUint256ArrayTest } from "../../../typechain/LibUint256ArrayTest";

describe("LibUint256Array unsafeCopyValuesTo tests", async function () {
  let libUint256Array: LibUint256ArrayTest;

  before(async () => {
    const libUint256ArrayFactory = await ethers.getContractFactory(
      "LibUint256ArrayTest"
    );
    libUint256Array =
      (await libUint256ArrayFactory.deploy()) as LibUint256ArrayTest;
  });

  it("should get item from list", async function () {
    const array = [5, 6, 7, 8];

    const length_ = await libUint256Array.getUnchecked(array, 0);
    assert(length_.eq(array.length));

    for (let i = 1; i <= array.length; i++) {
      const expectedItem = array[i - 1];
      const item_ = await libUint256Array.getUnchecked(array, i);

      assert(item_.eq(expectedItem));
    }
  });
});
