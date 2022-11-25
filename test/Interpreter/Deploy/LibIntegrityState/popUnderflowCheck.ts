import type { LibIntegrityStateTest } from "../../../../typechain";

import { libIntegrityStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";
import { op } from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityState popUnderflowCheck tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    libIntegrityState = await libIntegrityStateDeploy();
  });

  it("should fail check for stack underflow if stackTop > stackMaxTop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 32;
    const stackTop = 64;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop > stackMaxTop"
    );
  });

  it("should fail check for stack underflow if stackTop == stackMaxTop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 32;
    const stackTop = 32;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop == stackMaxTop"
    );
  });

  it("should pass check for stack underflow if stackTop == stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 32;

    await libIntegrityState.popUnderflowCheck(
      sources,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );
  });

  it("should fail check for stack underflow if stackTop < stackBottom", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 0;

    await assertError(
      async () => {
        await libIntegrityState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "STACK_UNDERFLOW",
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should pass check for stack underflow after pop on good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 32;

    await libIntegrityState.popUnderflowCheck(
      sources,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );
  });
});
