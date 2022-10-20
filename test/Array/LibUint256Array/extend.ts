import { assert } from "chai";
import type { LibUint256ArrayTest } from "../../../typechain";
import { libUint256ArrayDeploy } from "../../../utils/deploy/test/libUint256Array/deploy";

describe("LibUint256Array extend tests", async function () {
  let libUint256Array: LibUint256ArrayTest;

  before(async () => {
    libUint256Array = await libUint256ArrayDeploy();
  });

  it("should extend an array", async function () {
    const baseArray = [1, 2, 3, 4];
    const extendArray = [5, 6, 7];

    const expectedArray = [...baseArray, ...extendArray];

    const newArray_ = await libUint256Array.extend(baseArray, extendArray);

    assert(newArray_.length === baseArray.length + extendArray.length);

    for (let i = 0; i < expectedArray.length; i++) {
      assert(newArray_[i].eq(expectedArray[i]));
    }
  });
});
