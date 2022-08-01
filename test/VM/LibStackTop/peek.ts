import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain/LibStackTopTest";

describe("LibStackTop peek tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should peek up", async function () {
    const a_ = await libStackTop.callStatic.peekUp("0x0001000200030004");

    console.log({ a_ });
  });

  it("should peek", async function () {
    const a_ = await libStackTop.callStatic.peek("0x0001000200030004");

    console.log({ a_ });
  });
});
