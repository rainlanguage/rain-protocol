import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { LibInterpreterStateTest } from "../../../typechain";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";

describe("LibInterpreterState serialize tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
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

    const serialized_ = await libInterpreterState.callStatic.serialize(
      {
        sources,
        constants,
      },
      [1, 8]
    );

    assert(serialized_); // really can't verify much else at this stage
  });
});
