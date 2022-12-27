import type { LibIntegrityCheckTest } from "../../../../typechain";
import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";
import { op } from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityCheck popUnderflowCheck tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
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
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "StackUnderflow",
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
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "StackUnderflow",
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

    await libIntegrityCheckState.popUnderflowCheck(
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
        await libIntegrityCheckState.popUnderflowCheck(
          sources,
          constantsLength,
          stackBottom,
          stackMaxTop,
          stackTop
        );
      },
      "StackUnderflow",
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

    await libIntegrityCheckState.popUnderflowCheck(
      sources,
      constantsLength,
      stackBottom,
      stackMaxTop,
      stackTop
    );
  });
});
