import { assert } from "chai";
import type { LibIntegrityCheckTest } from "../../../../typechain";
import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";
import { op } from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityCheck pop tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
  });

  // pop n

  it("should fail pop n if stackTop > stackMaxTop after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 160;
    const n = 2;

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256,uint256,uint256,uint256,uint256)"
        ](sources, constantsLength, stackBottom, stackMaxTop, stackTop, n);
      },
      "StackUnderflow",
      "did not fail check"
    );
  });

  it("should fail pop n if stackTop == stackMaxTop after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 128;
    const n = 2;

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256,uint256,uint256,uint256,uint256)"
        ](sources, constantsLength, stackBottom, stackMaxTop, stackTop, n);
      },
      "StackUnderflow",
      "did not fail check"
    );
  });

  it("should pop n if stackTop == stackBottom after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 96;
    const n = 2;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256,uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackBottom, stackMaxTop, stackTop, n);

    assert(stackTopAfter_.eq(stackTop - 32 * n));
  });

  it("should pop n on the good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 96;
    const n = 2;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256,uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackBottom, stackMaxTop, stackTop, n);

    assert(stackTopAfter_.eq(stackTop - 32 * n));
  });

  // pop

  it("should fail pop if stackTop > stackMaxTop after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 128;

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256,uint256,uint256,uint256)"
        ](sources, constantsLength, stackBottom, stackMaxTop, stackTop);
      },
      "StackUnderflow",
      "did not fail check"
    );
  });

  it("should fail pop if stackTop == stackMaxTop after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 96;

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256,uint256,uint256,uint256)"
        ](sources, constantsLength, stackBottom, stackMaxTop, stackTop);
      },
      "StackUnderflow",
      "did not fail check"
    );
  });

  it("should pop if stackTop == stackBottom after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 32;
    const stackMaxTop = 64;
    const stackTop = 64;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackBottom, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop - 32));
  });

  it("should pop on the good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.BLOCK_NUMBER, 0),
      op(Opcode.BLOCK_NUMBER, 0),
    ];

    const constantsLength = 0;
    const stackBottom = 0;
    const stackMaxTop = 64;
    const stackTop = 64;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackBottom, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop - 32));
  });
});
