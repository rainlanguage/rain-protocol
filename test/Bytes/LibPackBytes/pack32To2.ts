import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibPackBytesTest } from "../../../typechain/LibPackBytesTest";
import { zeroPad32, zeroPad2 } from "../../../utils/bytes";
import { max_uint16 } from "../../../utils/constants/bigNumber";
import { range } from "../../../utils/range";
import { assertError } from "../../../utils/test/assertError";

describe("LibPackBytes pack32To2 tests", async function () {
  let libPackBytes: LibPackBytesTest;

  before(async () => {
    const libPackBytesFactory = await ethers.getContractFactory(
      "LibPackBytesTest"
    );
    libPackBytes = (await libPackBytesFactory.deploy()) as LibPackBytesTest;
  });

  it("currently (safely) overflows when packing a uint256 that exceeds max uint16", async function () {
    const byteStringMax = zeroPad32(max_uint16);
    const byteString0 = zeroPad32(max_uint16.add(1));
    const byteString1 = zeroPad32(max_uint16.add(2));
    const byteString2 = zeroPad32(max_uint16.add(3));

    await libPackBytes.pack32To2(byteStringMax);

    await libPackBytes.pack32To2(byteString0);
    await libPackBytes.pack32To2(byteString1);
    await libPackBytes.pack32To2(byteString2);
  });

  it("should revert when bytes cannot be interpreted as uint256s", async function () {
    const byteString = zeroPad32(ethers.BigNumber.from(1)) + "00"; // bytes length 34

    await assertError(
      async () => await libPackBytes.pack32To2(byteString),
      "BYTES_MOD_32",
      "did not revert when bytes length not multiple of 32"
    );
  });

  it("should pack a very large number of uint256s into bytes as uint16s", async function () {
    const array = range(1, 10000);

    let byteString = "0x";
    array.forEach((value) => {
      byteString += zeroPad32(ethers.BigNumber.from(value)).slice(2);
    });

    let expected = "0x";
    array.forEach((value) => {
      expected += zeroPad2(ethers.BigNumber.from(value)).slice(2);
    });

    const packedBytes_ = await libPackBytes.pack32To2(byteString);

    assert(
      packedBytes_ === expected,
      `wrong packed bytes
      expected  ${expected}
      got       ${packedBytes_}`
    );
  });

  it("should pack 17 uint256s into bytes as uint16s", async function () {
    const array = range(1, 17);

    let byteString = "0x";
    array.forEach((value) => {
      byteString += zeroPad32(ethers.BigNumber.from(value)).slice(2);
    });

    let expected = "0x";
    array.forEach((value) => {
      expected += zeroPad2(ethers.BigNumber.from(value)).slice(2);
    });

    const packedBytes_ = await libPackBytes.pack32To2(byteString);

    assert(
      packedBytes_ === expected,
      `wrong packed bytes
      expected  ${expected}
      got       ${packedBytes_}`
    );
  });

  it("should pack 16 uint256s into bytes as uint16s", async function () {
    const array = range(1, 16);

    let byteString = "0x";
    array.forEach((value) => {
      byteString += zeroPad32(ethers.BigNumber.from(value)).slice(2);
    });

    let expected = "0x";
    array.forEach((value) => {
      expected += zeroPad2(ethers.BigNumber.from(value)).slice(2);
    });

    const packedBytes_ = await libPackBytes.pack32To2(byteString);

    assert(
      packedBytes_ === expected,
      `wrong packed bytes
      expected  ${expected}
      got       ${packedBytes_}`
    );
  });

  it("should pack 2 uint256s into bytes as uint16s", async function () {
    const array = [10, 20];

    let byteString = "0x";
    array.forEach((value) => {
      byteString += zeroPad32(ethers.BigNumber.from(value)).slice(2);
    });

    let expected = "0x";
    array.forEach((value) => {
      expected += zeroPad2(ethers.BigNumber.from(value)).slice(2);
    });

    const packedBytes_ = await libPackBytes.pack32To2(byteString);

    assert(
      packedBytes_ === expected,
      `wrong packed bytes
      expected  ${expected}
      got       ${packedBytes_}`
    );
  });

  it("should pack 1 uint256 into bytes as uint16", async function () {
    const byteString = zeroPad32(ethers.BigNumber.from(10));

    const expected = "0x000a";
    const packedBytes_ = await libPackBytes.pack32To2(byteString);

    assert(
      packedBytes_ === expected,
      `wrong packed bytes
      expected  ${expected}
      got       ${packedBytes_}`
    );
  });
});
