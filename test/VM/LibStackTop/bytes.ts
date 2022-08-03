import { assert } from "chai";
import { arrayify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";
import { range } from "../../../utils/range";
import { assertError } from "../../../utils/test/assertError";

describe("LibStackTop bytes tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should peek up", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50, 0, 1, 2]);

    const a0_ = await libStackTop.callStatic["peekUp(bytes)"](array0);

    assert(a0_.eq(array0.length));

    // get next 32 bytes
    const a1_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      1
    );

    array0.forEach((element_, i_) => {
      assert(
        arrayify(a1_)[i_] === element_,
        `wrong value
        expected  ${element_}
        got       ${a1_}`
      );
    });
  });

  it("should peek up 32 byte chunks", async function () {
    const array0 = Uint8Array.from(range(1, 48));

    const a0_ = await libStackTop.callStatic["peekUp(bytes)"](array0);

    assert(a0_.eq(array0.length));

    // get first 32 bytes
    const a1_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      1
    );

    assert(arrayify(a1_).length === 32, "did not return 32 byte chunk");
    assert(
      arrayify(a1_)[31] === array0[31],
      "final byte in 1st chunk is wrong"
    );
    assert(
      arrayify(a1_)[32] === undefined,
      "returned more than 32 bytes in a chunk"
    );

    // get next 32 bytes
    const a2_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      2
    );

    assert(arrayify(a2_)[0] === array0[32], "first byte in 2nd chunk is wrong");
  });
});
