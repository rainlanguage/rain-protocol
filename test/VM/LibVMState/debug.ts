import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { StandardIntegrity } from "../../../typechain/StandardIntegrity";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";

enum DebugStyle {
  Stack,
  Constant,
  Context,
  Source,
}

describe("LibVMState debug tests", async function () {
  let libVMState: LibVMStateTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    const vmIntegrity =
      (await stateBuilderFactory.deploy()) as StandardIntegrity;
    await vmIntegrity.deployed();

    const libVMStateFactory = await ethers.getContractFactory("LibVMStateTest");
    libVMState = (await libVMStateFactory.deploy(
      vmIntegrity.address
    )) as LibVMStateTest;
  });

  it("should debug Constants", async () => {
    const debugStyle = DebugStyle.Constant;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ]),
      concat([
        op(Opcode.SENDER, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [3, 5, 7, 9, 11];
    const stackIndex = 0;

    console.log({ constants });

    const { stackTopBefore_, stackTopAfter_ } =
      await libVMState.callStatic.debug(
        { sources, constants },
        debugStyle,
        stackIndex,
        context
      );

    assert(stackTopAfter_.eq(stackTopBefore_));
  });

  it("should debug Source", async () => {
    const debugStyle = DebugStyle.Source;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ]),
      concat([
        op(Opcode.SENDER, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [3, 5, 7, 9, 11];
    const stackIndex = 0;

    const serialized_ = await libVMState.callStatic.serialize({
      sources,
      constants,
    });

    console.log({ serialized_ });

    const { stackTopBefore_, stackTopAfter_ } =
      await libVMState.callStatic.debug(
        { sources, constants },
        debugStyle,
        stackIndex,
        context
      );

    assert(stackTopAfter_.eq(stackTopBefore_));
  });
});
