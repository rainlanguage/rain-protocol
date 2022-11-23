import { assert } from "chai";
import { ethers } from "hardhat";
import { LibMemoryKVTest } from "../../../typechain/contracts/test/kv/LibMemoryKVTest";
import { libMemoryKVDeploy } from "../../../utils/deploy/test/libMemoryKV/deploy";

describe.only("LibMemoryKV tests", async function () {
  let libMemoryKV: LibMemoryKVTest;

  before(async () => {
    libMemoryKV = await libMemoryKVDeploy();
  });

  it("should set value", async function () {
    const kv = 0;
    const key = 68;
    const value = 1337;

    // Set value key:value
    const kv_ = await libMemoryKV.setVal(kv, key, value);

    // Invalid array returned
    console.log("Set Value = ", await libMemoryKV.toUint256Array(kv_), kv_);

    // Reading the value
    // 1. get the key pointer
    // 2. read value at pointer
    const ptr_ = await libMemoryKV.getPtr(kv_, key);
    const val_ = await libMemoryKV.readPtrVal(ptr_);

    // Assertion
    const expectedValue = ethers.BigNumber.from(value);
    assert(val_.eq(expectedValue), "Invalid value set");
  });
});
