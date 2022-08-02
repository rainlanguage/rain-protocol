import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

describe("LibStackTop bytes tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should peek up", async function () {
    const array0 = Uint8Array.from([10, 20, 30, 40, 50]);

    const a0_ = await libStackTop.callStatic["peekUp(bytes)"](array0);

    assert(a0_.eq(array0.length));

    const a1_ = await libStackTop.callStatic["peekUp(bytes,uint256)"](
      array0,
      32
    );

    assert(
      a1_.eq(array0[0]),
      `wrong value
      expected  ${array0[0]}
      got       ${a1_}`
    );
  });
});
