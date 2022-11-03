import { assert } from "chai";
import type { LibMemorySizeTest } from "../../../typechain";
import { libMemorySizeDeploy } from "../../../utils/deploy/test/libMemorySize/deploy";

describe("LibMemorySize bytes tests", async function () {
  let libMemorySize: LibMemorySizeTest;

  before(async () => {
    libMemorySize = await libMemorySizeDeploy();
  });

  it("returns bytes memory size", async function () {
    const bytes = Uint8Array.from([1, 2, 3, 4]);

    const size_ = await libMemorySize["size(bytes)"](bytes);

    assert(size_.eq(32 + bytes.length));
  });
});
