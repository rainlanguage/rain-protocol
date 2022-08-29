import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibConvertTest } from "../../../typechain";

describe("LibConvert tests", async function () {
  let libConvert: LibConvertTest;

  before(async () => {
    const libConvertFactory = await ethers.getContractFactory("LibConvertTest");
    libConvert = (await libConvertFactory.deploy()) as LibConvertTest;
  });

  it("converts an array of uints to bytes", async function () {
    const array = [1, 2, 3];

    const bytes_ = await libConvert.callStatic.toBytes(array);

    console.log({ bytes_ });

    assert(
      bytes_ ===
        "0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003"
    );

    const tx_ = await libConvert.toBytes(array);

    const { data: memDumpBefore_ } = (await tx_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "conversion did not involve expected structural changes"
    );
  });
});
