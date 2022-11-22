import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibMemoryKVTest } from "../../typechain";
import { libMemoryKVDeploy } from "../../utils/deploy/test/libMemoryKV/deploy";

describe("LibStackTop bytes tests", async function () {
  let libStackTop: LibMemoryKVTest;

  before(async () => {
    libStackTop = await libMemoryKVDeploy();
  });

  it("should set value", async function () {
    let kv_ = 0;
    let key = 68;
    let value = 1337;

    // Set value key:value
    let kv = await libStackTop.setVal(kv_, key, value);
    
    // Invalid array returned
    console.log("Set Value = ", (await libStackTop.toUint256Array(kv)), kv);
    
    // Reading the value
    // 1. get the key pointer
    // 2. read value at pointer
    let ptr = await libStackTop.getPtr(kv, key);    
    let val_ = await libStackTop.readPtrVal(ptr);

    // Assertion
    const expectedValue = ethers.BigNumber.from(value);    
    assert(val_.eq(expectedValue), "Invalid value set");
  });

});
