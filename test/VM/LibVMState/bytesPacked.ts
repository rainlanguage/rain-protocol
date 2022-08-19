import { assert } from "chai";
import { concat } from "ethers/lib/utils";
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

    assert(memDumpBefore_ === memDumpAfter_, "toBytesPacked corrupted memory");

    console.log({ bytesPacked_ });
  });
});
