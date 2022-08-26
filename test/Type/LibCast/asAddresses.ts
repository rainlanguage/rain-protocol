import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibCastTest } from "../../../typechain/LibCastTest";
import { randomUint256 } from "../../../utils/bytes";

describe("LibCast asAddresses tests", async function () {
  let libCast: LibCastTest;

  before(async () => {
    const libCastFactory = await ethers.getContractFactory("LibCastTest");
    libCast = (await libCastFactory.deploy()) as LibCastTest;
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
