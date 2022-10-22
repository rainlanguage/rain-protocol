import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  LibInterpreterStateTest,
  StandardIntegrity,
} from "../../../typechain";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";

describe("LibInterpreterState context tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    const interpreterIntegrity =
      (await stateBuilderFactory.deploy()) as StandardIntegrity;
    await interpreterIntegrity.deployed();

    const libInterpreterStateFactory = await ethers.getContractFactory(
      "LibInterpreterStateTest"
    );
    libInterpreterState = (await libInterpreterStateFactory.deploy(
      interpreterIntegrity.address
    )) as LibInterpreterStateTest;
  });

  it("should store a 2D context upon deserializing", async () => {
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.CONTEXT, 0x0000)
      ])
    ];
    const constants = [];

    const context = [
      [5, 0, 0, 0],
      [0, 8, 0, 0],
      [0, 0, 3, 0],
      [0, 6, 0, 0],
    ];

    // test fn serializes and then deserialises
    const state_ = await libInterpreterState.callStatic.serDeserialize(
      { sources, constants },
      context
    );

    const { context: context_ } = state_;

    context.forEach((rowArray, i_) => {
      rowArray.forEach((colElement, j_) => {
        assert(
          context_[i_][j_].eq(colElement),
          `mismatch at position (${i_},${j_}),
          expected  ${colElement}
          got       ${context_[i_][j_]}`
        );
      });
    });
  });
});