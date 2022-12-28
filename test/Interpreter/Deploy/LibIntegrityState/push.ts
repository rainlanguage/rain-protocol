import { assert } from "chai";
import type { LibIntegrityCheckTest } from "../../../../typechain";
import { libIntegrityCheckStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";

describe("LibIntegrityCheck push tests", async function () {
  let libIntegrityCheckState: LibIntegrityCheckTest;

  before(async () => {
    libIntegrityCheckState = await libIntegrityCheckStateDeploy();
  });

  it("should push n and sync stack top", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;
    const n = 3;

    const { stackTopAfter_, newStackMaxTop } = await libIntegrityCheckState[
      "push(bytes[],uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackMaxTop, stackTop, n);

    assert(
      stackTopAfter_.eq(stackTop + 32 * n),
      "did not push up correct bytes"
    );

    assert(
      newStackMaxTop.eq(stackTopAfter_),
      "did not sync new stackMaxTop when pushing past original stackMaxTop"
    );
  });

  it("should push and sync stack top", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;

    const { stackTopAfter_, newStackMaxTop } = await libIntegrityCheckState[
      "push(bytes[],uint256,uint256,uint256)"
    ](sources, constantsLength, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop + 32), "did not push up correct bytes");

    assert(
      newStackMaxTop.eq(stackTopAfter_),
      "did not sync new stackMaxTop when pushing past original stackMaxTop"
    );
  });

  it("should pushIgnoreHighwater and sync stack top", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;

    const { stackTopAfter_, newStackMaxTop } =
      await libIntegrityCheckState.pushIgnoreHighwater(
        sources,
        constantsLength,
        stackMaxTop,
        stackTop
      );

    assert(stackTopAfter_.eq(stackTop + 32), "did not push up correct bytes");

    assert(
      newStackMaxTop.eq(stackTopAfter_),
      "did not sync new stackMaxTop when pushing past original stackMaxTop"
    );
  });
});
