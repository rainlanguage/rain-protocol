import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain";
import { StandardIntegrity } from "../../../typechain";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibVMState deserialize tests", async function () {
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

  it("should convert packed bytes to VMState with deserialize", async () => {
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
    const state_ = await libVMState.callStatic.serDeserialize(
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
