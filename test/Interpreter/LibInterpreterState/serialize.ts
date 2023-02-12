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

describe("LibInterpreterState serialize tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;
  let interpreter: Rainterpreter;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
    interpreter = await rainterpreterDeploy();
  });

  it("should convert InterpreterState to packed bytes with serialize", async () => {
    // prettier-ignore

    const stackLength = 1
    const sources = [
      concat([
        // sourceIndex 0
        op(Opcode.blockNumber),
      ]),
    ];
    const constants = [];

    const serialized_ = await libInterpreterState.callStatic.serialize(
      interpreter.address,
      
        sources,
        constants,
      
      stackLength
    );

    assert(serialized_); // really can't verify much else at this stage
  });
});
