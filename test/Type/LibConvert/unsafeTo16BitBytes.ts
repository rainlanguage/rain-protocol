import { assert } from "chai";
import type { LibConvertTest } from "../../../typechain";
import { libConvertDeploy } from "../../../utils/deploy/type/libConvert/deploy";

describe("LibConvert unsafeTo16BitBytes tests", async function () {
  let libConvert: LibConvertTest;

  before(async () => {
    libConvert = await libConvertDeploy();
  });

  it("converts an array of uints to 16-bit bytes", async function () {
    const array = [0, 1, 2, 3];

    const bytes_ = await libConvert.callStatic.unsafeTo16BitBytes(array);

    console.log({ bytes_ });

    assert(bytes_ === "0x0000000100020003");

    const tx_ = await libConvert.unsafeTo16BitBytes(array);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "conversion did not involve any structural changes"
    );
  });
});
