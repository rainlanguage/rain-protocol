import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibIntegrityStateTest } from "../../../../typechain";
import { StorageOpcodesRangeStruct } from "../../../../typechain/contracts/interpreter/runtime/RainInterpreter";

describe("LibIntegrityState push tests", async function () {
  let libIntegrityState: LibIntegrityStateTest;

  before(async () => {
    const libIntegrityStateFactory = await ethers.getContractFactory(
      "LibIntegrityStateTest"
    );
    libIntegrityState =
      (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  });

  it("should push n", async function () {
    // prettier-ignore
    const sources = [
      new Uint8Array(),
    ];

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;
    const n = 3;

    const stackTopAfter_ = await libIntegrityState[
      "push(bytes[],(uint256,uint256),uint256,uint256,uint256,uint256)"
    ](sources, storageOpcodesRange, constantsLength, stackMaxTop, stackTop, n);

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

    const storageOpcodesRange: StorageOpcodesRangeStruct = {
      pointer: 0,
      length: 0,
    };
    const constantsLength = 0;
    const stackMaxTop = 0;
    const stackTop = 0;

    const stackTopAfter_ = await libIntegrityState[
      "push(bytes[],(uint256,uint256),uint256,uint256,uint256)"
    ](sources, storageOpcodesRange, constantsLength, stackMaxTop, stackTop);

    assert(stackTopAfter_.eq(stackTop + 32), "did not push up correct bytes");
  });
});
