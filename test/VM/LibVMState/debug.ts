import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";

enum DebugStyle {
  StatePacked,
  Stack,
}

describe("LibVMState debug tests", async function () {
  let libStackTop: LibVMStateTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibVMStateTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibVMStateTest;
  });

  it("should debug Stack", async () => {
    const stackTop = 32;
    const debugStyle = DebugStyle.Stack;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER)
      ])
    ];

    const stackTopAfter_ = await libStackTop.callStatic.debug(
      stackTop,
      debugStyle,
      sources
    );

    const tx0_ = await libStackTop.debug(stackTop, debugStyle, sources);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "debug corrupted memory");

    assert(stackTopAfter_.eq(stackTop), "stackTop should be unchanged");
  });

  it("should debug StatePacked", async () => {
    const stackTop = 32;
    const debugStyle = DebugStyle.StatePacked;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER)
      ])
    ];

    const stackTopAfter_ = await libStackTop.callStatic.debug(
      stackTop,
      debugStyle,
      sources
    );

    const tx0_ = await libStackTop.debug(stackTop, debugStyle, sources);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "debug corrupted memory");

    assert(stackTopAfter_.eq(stackTop), "stackTop should be unchanged");
  });
});
