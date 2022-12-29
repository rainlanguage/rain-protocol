import { concat } from "ethers/lib/utils";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  callOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";

describe("LibIntegrityCheck highwater tests", async function () {
  it("multioutput opcode MUST move the highwater past ALL its outputs (prevent nested multioutput on the stack)", async () => {
    const constants = [1, 2, 3, 4];

    const sourceONE = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
    ]);

    const sourceMAIN = concat([
      op(Opcode.CALL, callOperand(0, 4, 1)),
      op(Opcode.ADD, 4),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [sourceMAIN, sourceONE],
        constants,
      });

    await consumerLogic.eval(interpreter.address, dispatch, [[]]);
  });

  it("stack opcode MUST move the highwater past the index it reads from (prevent pop after copy from the stack)", async () => {
    throw new Error("TODO");
  });
});
