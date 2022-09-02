import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibMemorySizeTest } from "../../../typechain";

describe("LibMemorySize bytes tests", async function () {
  let libMemorySize: LibMemorySizeTest;

  before(async () => {
    const libMemorySizeFactory = await ethers.getContractFactory(
      "LibMemorySizeTest"
    );
    libMemorySize = (await libMemorySizeFactory.deploy()) as LibMemorySizeTest;
  });

  it("returns bytes memory size", async function () {
    const bytes = Uint8Array.from([1, 2, 3, 4]);

    const size_ = await libMemorySize["size(bytes)"](bytes);

    assert(size_.eq(32 + bytes.length));
  });
});
