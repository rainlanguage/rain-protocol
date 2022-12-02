import { assert } from "chai";
import type { LibIntegrityStateTest } from "../../../../typechain";

import { libIntegrityStateDeploy } from "../../../../utils/deploy/test/libIntegrityState/deploy";

describe("LibIntegrityState push tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    libIntegrityState = await libIntegrityStateDeploy();
  });

  it("should push n", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;
    const n = 3;

    const stackTopAfter_ = await libIntegrityState[
      "push(bytes[],uint256,uint256,uint256,uint256)"
    ](sources, constantsLength, stackMaxTop, stackTop, n);

    assert(
      stackTopAfter_.eq(stackTop + 32 * n),
      "did not push up correct bytes"
    );
  });

  it("should push", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;

    const stackTopAfter_ = await libIntegrityState[
      "push(bytes[],uint256,uint256,uint256)"
    ](sources, constantsLength, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop + 32), "did not push up correct bytes");
  });
});
