import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibUint256ArrayTest } from "../../../typechain";

describe("LibUint256Array arrayFrom tests", async function () {
  let libUint256Array: LibUint256ArrayTest;

  before(async () => {
    const libUint256ArrayFactory = await ethers.getContractFactory(
      "LibUint256ArrayTest"
    );
    libUint256Array =
      (await libUint256ArrayFactory.deploy()) as LibUint256ArrayTest;
  });

  it("should convert single uint256 to new array", async function () {
    const array_ = await libUint256Array["arrayFrom(uint256)"](10);

    assert(array_.length === 1);
    assert(array_[0].eq(10));
  });

  it("should convert two uint256s to new array", async function () {
    const array_ = await libUint256Array["arrayFrom(uint256,uint256)"](10, 20);

    assert(array_.length === 2);
    assert(array_[0].eq(10));
    assert(array_[1].eq(20));
  });

  it("should convert single uint256 and an array to a new array", async function () {
    const array_ = await libUint256Array["arrayFrom(uint256,uint256[])"](
      10,
      [20, 30]
    );

    assert(array_.length === 3);
    assert(array_[0].eq(10));
    assert(array_[1].eq(20));
    assert(array_[2].eq(30));
  });

  it("should convert two uint256s and an array to a new array", async function () {
    const array_ = await libUint256Array[
      "arrayFrom(uint256,uint256,uint256[])"
    ](10, 20, [30, 40]);

    assert(array_.length === 4);
    assert(array_[0].eq(10));
    assert(array_[1].eq(20));
    assert(array_[2].eq(30));
    assert(array_[3].eq(40));
  });
});
