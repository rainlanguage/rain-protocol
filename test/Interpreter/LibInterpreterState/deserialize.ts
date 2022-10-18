import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  LibInterpreterStateTest,
  StandardIntegrity,
} from "../../../typechain";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { op } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibInterpreterState deserialize tests", async function () {
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

  it("should convert packed bytes to InterpreterState with deserialize", async () => {
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
    const context = [];

    // test fn serializes and then deserialises
    const state_ = await libInterpreterState.callStatic.serDeserialize(
      { sources, constants },
      context
    );

    const expectedStatePartial = {
      context: [0, 0, 0, 0, 0],
    };

    compareStructs(state_, expectedStatePartial);

    assert(state_.compiledSources.length === 2);
    assert(state_.compiledSources[0].length === 10);
    assert(state_.compiledSources[1].length === 18);
    assert(state_.constantsBottom < state_.stackBottom);
  });
});
