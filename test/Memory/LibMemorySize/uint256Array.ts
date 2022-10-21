import { assert } from "chai";
import type { LibMemorySizeTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libMemorySizeDeploy } from "../../../utils/deploy/test/libMemorySize/deploy";

describe("LibMemorySize uint256[] tests", async function () {
  let libMemorySize: LibMemorySizeTest;

  before(async () => {
    libMemorySize = await libMemorySizeDeploy();
  });

  it("returns uint256[] memory size", async function () {
    const array = [randomUint256(), randomUint256(), randomUint256()];

    const size_ = await libMemorySize["size(uint256[])"](array);

    assert(size_.eq(32 + 32 * array.length));
  });
});
