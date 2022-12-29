import { assert } from "chai";
import type { LibUint256ArrayTest } from "../../../typechain";
import { libUint256ArrayDeploy } from "../../../utils/deploy/test/libUint256Array/deploy";
import { assertError } from "../../../utils/test/assertError";

describe("LibUint256Array truncate tests", async function () {
  let libUint256Array: LibUint256ArrayTest;

  before(async () => {
    libUint256Array = await libUint256ArrayDeploy();
  });

  it("should truncate an array", async function () {
    const array = [1, 2, 3, 4];
    const newLength = 2;

    const newArray_ = await libUint256Array.truncate(array, newLength);

    assert(newArray_.length === newLength);

    for (let i = 0; i < newLength; i++) {
      assert(newArray_[i].eq(array[i]));
    }
  });

  it("should revert if new length greater than current array length", async function () {
    const array = [1, 2, 3];
    const newLength = 4;

    await assertError(
      async () => await libUint256Array.truncate(array, newLength),
      `errorArgs=[{"type":"BigNumber","hex":"0x03"},{"type":"BigNumber","hex":"0x04"}], errorName="OutOfBoundsTruncate"`,
      "did not revert when new length greater than array length"
    );
  });
});
