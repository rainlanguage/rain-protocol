import { assert } from "chai";
import type { LibUint256ArrayTest } from "../../../typechain";
import { libUint256ArrayDeploy } from "../../../utils/deploy/test/libUint256Array/deploy";

describe("LibUint256Array unsafeCopyValuesTo tests", async function () {
  let libUint256Array: LibUint256ArrayTest;

  before(async () => {
    libUint256Array = await libUint256ArrayDeploy();
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

    const outputs_ = await libUint256Array.copyToNewUint256Array(array);

    assert(outputs_.length === array.length);

    for (let i = 0; i < array.length; i++) {
      assert(outputs_[i].eq(array[i]));
    }
  });
});
