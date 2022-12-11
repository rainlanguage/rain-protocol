import { LibMemoryKVTest } from "../../../typechain/contracts/test/kv/LibMemoryKVTest";
import { libMemoryKVDeploy } from "../../../utils/deploy/test/libMemoryKV/deploy";

describe("LibMemoryKV tests", async function () {
  let libMemoryKV: LibMemoryKVTest;

  before(async () => {
    libMemoryKV = await libMemoryKVDeploy();
  });

  // TODO: Dump memory at each point to check it's doing correct thing at each step

  it("should set a value", async function () {
    const kv = 0;
    const key = 68;
    const val = 1337;

    const tx0_ = await libMemoryKV.setVal(kv, key, val);

    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter__ } = (await tx0_.wait()).events[1];
    const { data: kvSetVal_ } = (await tx0_.wait()).events[2];

    console.log({
      memDumpBefore_,
      memDumpAfter__,
      kvSetVal_,
    });

    // TODO: use kvSetVal_ to determine what position in memDumpAfter__ to read from, which should be a linked list of 68, 1337, 0
  });
});
