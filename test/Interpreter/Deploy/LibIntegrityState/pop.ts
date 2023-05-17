import { strict as assert } from "assert";
import type { LibIntegrityCheckTest } from "../../../../typechain";
import { INITIAL_STACK_BOTTOM } from "../../../../utils/constants/interpreter";
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

  it("should pop n if stackTop == stackBottom after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(32);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(96);
    const n = 2;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256[],uint256,uint256,uint256,uint256,uint256)"
    ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop, n);

    assert(stackTopAfter_.eq(stackTop.sub(32 * n)));
  });

  it("should fail underflow check for pop n if stackTop < stackBottom after pop n", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(32);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(0);
    const n = 2;

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256[],uint256,uint256,uint256,uint256,uint256)"
        ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop, n);
      },
      "StackPopUnderflow",
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should pop n on the good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(96);
    const n = 2;

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256[],uint256,uint256,uint256,uint256,uint256)"
    ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop, n);

    assert(stackTopAfter_.eq(stackTop.sub(32 * n)));
  });

  // pop

  it("should pop if stackTop == stackBottom after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(32);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(64);

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256[],uint256,uint256,uint256,uint256)"
    ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop.sub(32)));
  });

  it("should fail underflow check for pop if stackTop < stackBottom after pop", async function () {
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
        await libIntegrityCheckState[
          "pop(bytes[],uint256[],uint256,uint256,uint256,uint256)"
        ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop);
      },
      "StackPopUnderflow",
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should fail underflow check for pop if stackTop < stackHighwater after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(64);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(64);

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256[],uint256,uint256,uint256,uint256)"
        ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop);
      },
      `errorArgs=[{"type":"BigNumber","hex":"0x02"},{"type":"BigNumber","hex":"0x01"}], errorName="StackPopUnderflow"`,
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should fail underflow check for pop if stackTop == stackHighwater after pop", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(32);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(64);

    await assertError(
      async () => {
        await libIntegrityCheckState[
          "pop(bytes[],uint256[],uint256,uint256,uint256,uint256)"
        ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop);
      },
      `errorArgs=[{"type":"BigNumber","hex":"0x01"},{"type":"BigNumber","hex":"0x01"}], errorName="StackPopUnderflow"`,
      "did not fail check when stackTop < stackBottom"
    );
  });

  it("should pop on the good path", async function () {
    // prettier-ignore
    const sources = [
      op(Opcode.block_number, 0),
      op(Opcode.block_number, 0),
    ];

    const stackBottom = INITIAL_STACK_BOTTOM.add(0);
    const stackHighwater = INITIAL_STACK_BOTTOM.add(0);
    const stackMaxTop = INITIAL_STACK_BOTTOM.add(64);
    const stackTop = INITIAL_STACK_BOTTOM.add(64);

    const stackTopAfter_ = await libIntegrityCheckState[
      "pop(bytes[],uint256[],uint256,uint256,uint256,uint256)"
    ](sources, [], stackBottom, stackHighwater, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop.sub(32)));
  });
});
