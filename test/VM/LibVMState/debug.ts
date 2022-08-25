import { assert } from "chai";
import { concat } from "ethers/lib/utils";
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

  xit("should debug Stack", async () => {
    const debugStyle = DebugStyle.Stack;
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
    const stackIndex = 0;

    const serialized_ = await libVMState.callStatic.serialize({
      sources,
      constants,
    });

    const { stackTopBefore_, stackTopAfter_ } =
      await libVMState.callStatic.debug(
        { sources, constants },
        debugStyle,
        stackIndex
      );

    assert(stackTopAfter_.eq(stackTopBefore_));

    console.log({
      serialized_,
      sources,
      constants,
      stackIndex,
      stackTopBefore_,
      stackTopAfter_,
    });
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
    const stackIndex = 0;

    const serialized_ = await libVMState.callStatic.serialize({
      sources,
      constants,
    });

    const { stackTopBefore_, stackTopAfter_ } =
      await libVMState.callStatic.debug(
        { sources, constants },
        debugStyle,
        stackIndex
      );

    assert(stackTopAfter_.eq(stackTopBefore_));

    console.log({
      serialized_,
      sources,
      constants,
    });
  });
});
