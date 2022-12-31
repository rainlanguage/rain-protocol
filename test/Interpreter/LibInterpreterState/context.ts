import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type {
  LibInterpreterStateTest,
  Rainterpreter,
} from "../../../typechain";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";

describe("LibInterpreterState context tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;
  let interpreter: Rainterpreter;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
    interpreter = await rainterpreterDeploy();
  });

  it("should store a 2D context upon deserializing", async () => {
    // prettier-ignore
    const stackLength = 1
    const sources = [concat([op(Opcode.CONTEXT, 0x0000)])];
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
      stackLength,
      context,
      interpreter.address
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
