import { strict as assert } from "assert";
import { concat } from "ethers/lib/utils";
import type {
  LibInterpreterStateTest,
  Rainterpreter,
} from "../../../typechain";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibInterpreterState deserialize tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;
  let interpreter: Rainterpreter;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
    interpreter = await rainterpreterDeploy();
  });

  it("should convert packed bytes to InterpreterState with deserialize", async () => {
    // prettier-ignore
    const stackLength = 2
    const sources = [
      concat([
        // sourceIndex 0
        op(Opcode.block_number),
      ]),
      concat([
        // sourceIndex 1
        op(Opcode.block_number),
        op(Opcode.explode_32),
      ]),
    ];
    const constants = [];
    const context = [];

    // test fn serializes and then deserialises
    const state_ = await libInterpreterState.callStatic.serDeserialize(
      sources,
      constants,
      stackLength,
      context,
      interpreter.address
    );

    const expectedStatePartial = {
      context: [0, 0, 0, 0, 0],
    };

    compareStructs(state_, expectedStatePartial);

    assert(
      state_.compiledSources.length === 2,
      "wrong length, got " + state_.compiledSources.length
    );
    assert(
      state_.compiledSources[0].length === 10,
      "wrong length, got" + state_.compiledSources[0].length
    );
    assert(
      state_.compiledSources[1].length === 18,
      "wrong length, got" + state_.compiledSources[1].length
    );
    assert(
      state_.constantsBottom.lt(state_.stackBottom),
      `wrong constants position
      constantsBottom  ${state_.constantsBottom}
      stackBottom      ${state_.stackBottom}`
    );
  });
});
