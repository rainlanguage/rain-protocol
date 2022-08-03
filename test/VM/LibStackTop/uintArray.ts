import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

describe("LibStackTop uint array tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should peek up", async function () {
    const array0 = [10, 20, 30, 40, 50, 0, 1, 2];

    const a0_ = await libStackTop.callStatic["peekUp(uint256[])"](array0);

    assert(a0_.eq(array0.length));

    array0.forEach(async (element_, i_) => {
      const a_ = await libStackTop.callStatic["peekUp(uint256[],uint256)"](
        array0,
        i_ + 1
      );

      assert(
        a_.eq(element_),
        `wrong value
        expected  ${element_}
        got       ${a_}`
      );
    });
  });
});
