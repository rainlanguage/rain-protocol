import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain";
import { libStackTopDeploy } from "../../../utils/deploy/test/libStackTop/deploy";

describe("LibStackTop stackTop tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    libStackTop = await libStackTopDeploy();
  });

  it("should go up 32 bytes", async () => {
    const array0 = [5, 6, 7, 8];

    const { stackTopBefore_, stackTopAfter_ } = await libStackTop.callStatic[
      "up(uint256[])"
    ](array0);

    const tx0_ = await libStackTop["up(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "up corrupted memory");

    assert(
      stackTopAfter_.eq(stackTopBefore_.add(32)),
      "did not go up 32 bytes"
    );
  });

  it("should go up n by 32 bytes", async () => {
    const array0 = [5, 6, 7, 8];
    const n = 3;

    const { stackTopBefore_, stackTopAfter_ } = await libStackTop.callStatic[
      "up(uint256[],uint256)"
    ](array0, n);

    const tx0_ = await libStackTop["up(uint256[],uint256)"](array0, n);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "up corrupted memory");

    assert(
      stackTopAfter_.eq(stackTopBefore_.add(32 * n)),
      "did not go up n by 32 bytes"
    );
  });

  it("should go down 32 bytes", async () => {
    const array0 = [5, 6, 7, 8];

    const { stackTopBefore_, stackTopAfter_ } = await libStackTop.callStatic[
      "down(uint256[])"
    ](array0);

    const tx0_ = await libStackTop["down(uint256[])"](array0);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "down corrupted memory");

    assert(
      stackTopAfter_.eq(stackTopBefore_.sub(32)),
      "did not go down 32 bytes"
    );
  });

  it("should go down n by 32 bytes", async () => {
    const array0 = [5, 6, 7, 8];
    const n = 3;

    const { stackTopBefore_, stackTopAfter_ } = await libStackTop.callStatic[
      "down(uint256[],uint256)"
    ](array0, n);

    const tx0_ = await libStackTop["down(uint256[],uint256)"](array0, n);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "down corrupted memory");

    assert(
      stackTopAfter_.eq(stackTopBefore_.sub(32 * n)),
      "did not go down n by 32 bytes"
    );
  });

  it("should go up n bytes", async () => {
    const array0 = [5, 6, 7, 8];
    const n = 3;

    const { stackTopBefore_, stackTopAfter_ } = await libStackTop.callStatic[
      "upBytes(uint256[],uint256)"
    ](array0, n);

    const tx0_ = await libStackTop["upBytes(uint256[],uint256)"](array0, n);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "upBytes corrupted memory");

    assert(stackTopAfter_.eq(stackTopBefore_.add(n)), "did not go up n bytes");
  });

  it("should convert two stack top values to a single stack index", async () => {
    const array0 = [5, 6, 7];
    const array1 = [50, 60, 70, 80, 90];

    const { index_, stackBottom_, stackTop_ } =
      await libStackTop.callStatic.toIndex(array0, array1);

    const tx0_ = await libStackTop.toIndex(array0, array1);
    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter_ } = (await tx0_.wait()).events[1];

    assert(memDumpBefore_ === memDumpAfter_, "toIndex corrupted memory");

    const expectedIndex = stackTop_.sub(stackBottom_).div(32);

    assert(
      index_.eq(expectedIndex),
      `wrong index
      expected  ${expectedIndex}
      got       ${index_}`
    );
  });
});
