import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";

describe("LibVMState bytesPacked tests", async function () {
  let libStackTop: LibVMStateTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibVMStateTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibVMStateTest;
  });

  it("should convert vmState toBytesPacked", async () => {
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER)
      ])
    ];

    const bytesPacked_ = await libStackTop.callStatic.toBytesPacked(sources);

    const tx0_ = await libStackTop.toBytesPacked(sources);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(
      memDumpBefore_ !== memDumpAfter_,
      "toBytesPacked did not modify memory"
    );

    assert(
      bytesPacked_ ===
        "0x0000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020f00"
    );

    assert(
      bytesPacked_.slice(-6) ===
        "02" + // source0 length
          hexlify(Opcode.BLOCK_NUMBER).slice(2) + // opcode
          "00" // operand
    );
  });
});
