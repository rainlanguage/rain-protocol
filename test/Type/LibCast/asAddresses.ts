import { assert } from "chai";
import type { LibCastTest } from "../../../typechain";
import { randomUint256 } from "../../../utils/bytes";
import { libCastDeploy } from "../../../utils/deploy/type/libCast/deploy";

describe("LibCast asAddresses tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    libCast = await libCastDeploy();
  });

  it("retypes an integer to an eval function pointer without corrupting memory", async function () {
    const randomNums = [randomUint256(), randomUint256(), randomUint256()];

    const is_ = await libCast.asAddresses([...randomNums]);

    is_.forEach((value_, index_) => {
      assert(
        value_.toLowerCase() ===
          "0x" + randomNums[index_].toLowerCase().substring(66 - 40), // 160-bit address
        `did not return correct address
        expected  ${"0x" + randomNums[index_].toLowerCase().substring(66 - 40)}
        got       ${value_.toLowerCase()}`
      );
    });
  });
});
