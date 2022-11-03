import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { LibInterpreterStateTest } from "../../../typechain";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibInterpreterState deserialize tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
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
