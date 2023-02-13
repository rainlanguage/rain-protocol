import type { LibIntegrityCheckTest } from "../../../../typechain";
import { INITIAL_STACK_BOTTOM } from "../../../../utils/constants/interpreter";
import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";
import { op } from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityCheck popUnderflowCheck tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
  });

  it("should pass check for stack underflow if stackTop == stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(32);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(32);

    await libIntegrityCheckState.popUnderflowCheck(
      sources,
      [],
      stackBottom,
      stackHighwater,
      stackMaxTop,
      stackTop
    );
  });

  it("should fail check for stack underflow if stackTop < stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(32);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(0);

    await assertError(
      async () => {
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          [],
          stackBottom,
          stackHighwater,
          stackMaxTop,
          stackTop
        );
      },
      "StackPopUnderflow",
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should fail check for stack underflow if stackTop < stackHighwater", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(64);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(32);

    await assertError(
      async () => {
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          [],
          stackBottom,
          stackHighwater,
          stackMaxTop,
          stackTop
        );
      },
      "StackPopUnderflow",
      "did not fail check when stackTop < stackHighwater"
    );
  });

  it("should fail check for stack underflow if stackTop == stackHighwater", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(32);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(32);

    await assertError(
      async () => {
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          [],
          stackBottom,
          stackHighwater,
          stackMaxTop,
          stackTop
        );
      },
      "StackPopUnderflow",
      "did not fail check when stackTop == stackHighwater"
    );
  });

  it("should pass check for stack underflow on good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(32);

    await libIntegrityCheckState.popUnderflowCheck(
      sources,
      [],
      stackBottom,
      stackHighwater,
      stackMaxTop,
      stackTop
    );
  });
});
