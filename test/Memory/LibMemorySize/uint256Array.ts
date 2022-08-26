import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibMemorySizeTest } from "../../../typechain/LibMemorySizeTest";
import { randomUint256 } from "../../../utils/bytes";

describe("LibMemorySize uint256[] tests", async function () {
  let libMemorySize: LibMemorySizeTest;

  before(async () => {
    const libMemorySizeFactory = await ethers.getContractFactory(
      "LibMemorySizeTest"
    );
    libMemorySize = (await libMemorySizeFactory.deploy()) as LibMemorySizeTest;
  });

  it("returns uint256[] memory size", async function () {
    const array = [randomUint256(), randomUint256(), randomUint256()];

    const size_ = await libMemorySize["size(uint256[])"](array);

    assert(size_.eq(32 + 32 * array.length));
  });
});
