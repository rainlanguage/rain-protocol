import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";

enum DebugStyle {
  Stack,
  Constant,
  Context,
  Source,
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
    const stackIndex = 0;
    const debugStyle = DebugStyle.Stack;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER)
      ])
    ];

    const _stackTopAfter_ = await libStackTop.callStatic.debug(
      stackIndex,
      debugStyle,
      sources
    );
  });
});
