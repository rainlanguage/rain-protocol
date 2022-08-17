import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibBytesTest } from "../../../typechain/LibBytesTest";
import { readBytes } from "../../../utils/bytes";

describe("LibBytes unsafeCopyBytesTo tests", async function () {
  let libBytes: LibBytesTest;

  before(async () => {
    const libBytesFactory = await ethers.getContractFactory("LibBytesTest");
    libBytes = (await libBytesFactory.deploy()) as LibBytesTest;
  });

  it("should unsafe copy bytes to a location in memory", async function () {
    const bytes0 = Uint8Array.from([1, 2, 3, 4]);
    const bytes1 = Uint8Array.from([5, 6, 7, 8]);

    const stackTop_ = await libBytes.callStatic.unsafeCopyBytesTo(
      bytes0,
      bytes1
    );

    const tx0_ = await libBytes.unsafeCopyBytesTo(bytes0, bytes1);

    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "unsafeCopyBytesTo did not modify memory"
    );

    // read top 32 bytes on the stack
    const preservedBytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber(),
      stackTop_.toNumber() + 32
    );
    // read newly written bytes on the stack, preceeding top 32 bytes on the stack
    const newBytes_ = readBytes(
      memDumpAfter_,
      stackTop_.toNumber() - bytes1.length,
      stackTop_.toNumber()
    );

    assert(newBytes_ === "0x05060708");
    assert(
      preservedBytes_ ===
        "0x0000000000000000000000000000000000000000000000000000000401020304"
    );
  });
});
