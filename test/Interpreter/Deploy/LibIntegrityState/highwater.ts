import { concat } from "ethers/lib/utils";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  callOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityCheck highwater tests", async function () {
  it("should prevent nested multioutput on the stack", async () => {
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

    await assertError(
      async () =>
        await iinterpreterV1ConsumerDeploy(
          {
            sources: [sourceMAIN, sourceONE],
            constants,
          },
          1
        ),
      "StackPopUnderflow(3, 0)",
      "did not prevent nested multioutput"
    );
  });

  it("should prevent pop after copy from the stack", async () => {
    const constants = [1];

    // prettier-ignore
    const sourceMAIN = concat([
      // _: 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),

      // _: add<3>(add(1 stack(0)) stack(0));
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.ADD, 2),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.ADD, 3),
    ]);

    await assertError(
      async () =>
        await iinterpreterV1ConsumerDeploy(
          {
            sources: [sourceMAIN],
            constants,
          },
          1
        ),
      "StackPopUnderflow(0, 0)",
      "did not prevent pop after copy from the stack"
    );
  });
});
