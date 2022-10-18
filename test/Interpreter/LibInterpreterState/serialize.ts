import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  LibInterpreterStateTest,
  StandardIntegrity,
} from "../../../typechain";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { op } from "../../../utils/interpreter/interpreter";

describe("LibInterpreterState serialize tests", async function () {
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

  it("should convert InterpreterState to packed bytes with serialize", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ]),
      concat([ // sourceIndex 1
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];
    const constants = [];

    const serialized_ = await libInterpreterState.callStatic.serialize({
      sources,
      constants,
    });

    assert(serialized_); // really can't verify much else at this stage
  });
});
