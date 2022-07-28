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

  it("should unsafe copy array to a location in memory", async function () {
    const array = [1, 2, 3, 4];

    const outputs_ = await libUint256Array.unsafeCopyValuesTo(array);

    assert(outputs_.length === array.length);

    for (let i = 0; i < array.length; i++) {
      assert(outputs_[i].eq(array[i]));
    }
  });

  it("should unsafe copy array to a new array", async function () {
    const array = [1, 2, 3, 4];

    const outputs_ = await libUint256Array.unsafeCopyValuesToNewArray(array);

    assert(outputs_.length === array.length);

    for (let i = 0; i < array.length; i++) {
      assert(outputs_[i].eq(array[i]));
    }
  });
});
