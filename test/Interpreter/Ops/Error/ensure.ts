import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { AllStandardOpsTest } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("ENSURE Opcode test", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should execute the transaction if it passes the ensure opcode condition", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
            v1,
            v2,
            v3,
        op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v1,
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // 2 ? 2 : 3
            v2,
            v2,
            v3,
        op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v3
    ]);

    await logic.initialize({
      sources: [source1],
      constants,
    });

    await logic.run();
    const result1 = await logic.stackTop();

    assert(result1.eq(3), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
            v0,
            v2,
            v3,
        op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v0
    ]);

    await logic.initialize({
      sources: [source2],
      constants,
    });

    await logic.run();
    const result2 = await logic.stackTop();

    assert(result2.eq(0), `returned wrong value from eager if, got ${result2}`);
  });

  it("should revert the transaction if it fails ensure opcode condition", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
            v0,
            v2,
            v0,
        op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v1,
    ]);

    await logic.initialize({
      sources: [source0],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "",
      "did not revert even after failing the ensure opcode condition"
    );
    const source1 = concat([
      // 2 ? 2 : 3
      v2,
      v0,
      v3,
      op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v3,
    ]);

    await logic.initialize({
      sources: [source1],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "",
      "did not revert even after failing the ensure opcode condition"
    );

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
            v0,
            v2,
            v0,
        op(Opcode.EAGER_IF),
      op(Opcode.ENSURE, 1),
      v0
    ]);

    await logic.initialize({
      sources: [source2],
      constants,
    });

    await assertError(
      async () => await logic.run(),
      "",
      "did not revert even after failing the ensure opcode condition"
    );
  });
});
