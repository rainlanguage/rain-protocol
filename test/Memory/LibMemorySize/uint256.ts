import { strict as assert } from "assert";
import type { LibMemorySizeTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libMemorySizeDeploy } from "../../../utils/deploy/test/libMemorySize/deploy";

describe("LibMemorySize uint256 tests", async function () {
  let libMemorySize: LibMemorySizeTest;

  before(async () => {
    libMemorySize = await libMemorySizeDeploy();
  });

  it("returns uint256 memory size", async function () {
    const size_ = await libMemorySize["size(uint256)"](randomUint256());

    assert(size_.eq(32));
  });
});
