import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";

describe("LibVMState toBytesPacked tests", async function () {
  let libStackTop: LibVMStateTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibVMStateTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibVMStateTest;
  });

  it("should convert VMState to packed bytes with toBytesPacked", async () => {
    const ptrSources = [
      Uint8Array.from([5, 6, 7, 8]),
      Uint8Array.from([4, 3, 2, 1]),
    ];

    const bytesPacked_ = await libStackTop.callStatic.toBytesPacked(ptrSources);

    assert(
      bytesPacked_ ===
        "0x00000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000405060708000000000000000000000000000000000000000000000000000000000000000404030201"
    );
  });
});
