import { assert } from "chai";
import type { LibIntegrityStateTest } from "../../../../typechain";
import { libIntegrityStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";
import { assertError } from "../../../../utils/test/assertError";

describe("LibIntegrityState applyFn tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    libIntegrityState = await libIntegrityStateDeploy();
  });

  it("should applyFnN function(uint256, uint256) internal view returns (uint256)", async function () {
    const n = 5;
    const stackTop = 32 * n;
    const stackTopAfter_ = await libIntegrityState.applyFnN(stackTop, n);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFnN(stackTop - 32, n),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256, uint256[] memory, uint256[] memory) internal view returns (uint256[] memory)", async function () {
    const length = 3;
    const stackTop = 32 * length * 2 + 32;
    const stackTopAfter_ = await libIntegrityState.applyFn8(stackTop, length);
    assert(stackTopAfter_.eq(32 * length));
    await assertError(
      async () => await libIntegrityState.applyFn8(stackTop - 32, length),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256, uint256, uint256, uint256[] memory) internal view returns (uint256)", async function () {
    const length = 3;
    const stackTop = 32 * length + 32 * 3;
    const stackTopAfter_ = await libIntegrityState.applyFn7(stackTop, length);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn7(stackTop - 32, length),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256, uint256, uint256[] memory) internal view returns (uint256)", async function () {
    const length = 3;
    const stackTop = 32 * length + 32 * 2;
    const stackTopAfter_ = await libIntegrityState.applyFn6(stackTop, length);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn6(stackTop - 32, length),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256[] memory) internal view returns (uint256)", async function () {
    const length = 3;
    const stackTop = 32 * length;
    const stackTopAfter_ = await libIntegrityState.applyFn5(stackTop, length);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn5(stackTop - 32, length),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256, uint256, uint256) internal view returns (uint256)", async function () {
    const stackTop = 32 * 3;
    const stackTopAfter_ = await libIntegrityState.applyFn4(stackTop);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn4(stackTop - 32),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(Operand, uint256, uint256) internal view returns (uint256)", async function () {
    const stackTop = 32 * 2;
    const stackTopAfter_ = await libIntegrityState.applyFn3(stackTop);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn3(stackTop - 32),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256, uint256) internal view returns (uint256)", async function () {
    const stackTop = 32 * 2;
    const stackTopAfter_ = await libIntegrityState.applyFn2(stackTop);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn2(stackTop - 32),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(Operand, uint256) internal view returns (uint256)", async function () {
    const stackTop = 32;
    const stackTopAfter_ = await libIntegrityState.applyFn1(stackTop);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn1(stackTop - 32),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });

  it("should applyFn function(uint256) internal view returns (uint256)", async function () {
    const stackTop = 32;
    const stackTopAfter_ = await libIntegrityState.applyFn0(stackTop);
    assert(stackTopAfter_.eq(32));
    await assertError(
      async () => await libIntegrityState.applyFn0(stackTop - 32),
      "STACK_UNDERFLOW",
      "did not underflow with insufficient stack height"
    );
  });
});
