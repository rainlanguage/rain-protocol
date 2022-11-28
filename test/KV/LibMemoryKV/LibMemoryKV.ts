import { assert } from "chai";
import { ethers } from "hardhat";
import { LibMemoryKVTest } from "../../../typechain/contracts/test/kv/LibMemoryKVTest";
import {
  numberify,
  readBytes,
  readUint256BytesArrayFromMemDump,
} from "../../../utils/bytes";
import { libMemoryKVDeploy } from "../../../utils/deploy/test/libMemoryKV/deploy";
import { assertError } from "../../../utils/test/assertError";

describe("LibMemoryKV tests", async function () {
  let libMemoryKV: LibMemoryKVTest;

  before(async () => {
    libMemoryKV = await libMemoryKVDeploy();
  });

  it("should support namespaced memory kv stores", async function () {
    const kv0 = 0;
    const kv1 = 1;
    const key = 68;
    const val0 = 1337;
    const val1 = 42069;

    const tx0_ = await libMemoryKV.scenario6(kv0, kv1, key, val0, val1);

    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter__ } = (await tx0_.wait()).events[1];
    const { data: val0_ } = (await tx0_.wait()).events[2];
    const { data: val1_ } = (await tx0_.wait()).events[3];

    assert(
      memDumpBefore_.length !== memDumpAfter__.length,
      "should have allocated new memory because we are writing to different memory kv namespace which doesn't already have a value for the same key"
    );

    assert(numberify(val0_) === val0);
    assert(numberify(val1_) === val1);
  });

  it("should support several key value pairs in kv store", async function () {
    const kv = 0;
    const key0 = 68;
    const val0 = 1337;
    const key1 = 69;
    const val1 = 42069;

    const array_ = await libMemoryKV.scenario5(kv, key0, val0, key1, val1);
    const expectedArray = [key1, val1, key0, val0];

    expectedArray.forEach((expectedItem, i_) => {
      assert(
        ethers.BigNumber.from(expectedItem).eq(array_[i_]),

        `wrong item in uint256 array
        expected  ${ethers.BigNumber.from(expectedItem)}
        got       ${array_[i_]}
        index     ${i_}`
      );
    });
  });

  it("should update a value without allocating new memory if pointer already exists for the given key", async function () {
    const kv = 0;
    const key = 68;
    const val0 = 1337;
    const val1 = 42069;

    const tx0_ = await libMemoryKV.scenario4(kv, key, val0, val1);

    const { data: memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter__ } = (await tx0_.wait()).events[1];
    const { data: val_ } = (await tx0_.wait()).events[2];

    assert(
      memDumpBefore_.length === memDumpAfter__.length,
      "wrongly allocated new memory when value should have simply been overwritten"
    );

    assert(numberify(val_) === val1);
  });

  it("should revert readPtrVal if pointer is zero", async function () {
    await assertError(
      async () => await libMemoryKV.readPtrVal(0),
      "INVALID_PTR",
      "did not revert when passing zero pointer"
    );
  });

  it("should return value when key exists", async function () {
    const kv = 0;
    const key = 68;
    const val = 1337;

    const val_ = await libMemoryKV.scenario3(kv, key, val);

    assert(val_.eq(val));
  });

  it("should return zero pointer if key not found in memory kv store", async function () {
    const kv = 0;
    const key = 68;

    const ptr_ = await libMemoryKV.scenario2(kv, key);

    assert(ptr_.isZero());
  });

  it("should return pointer for a given key when key exists", async function () {
    const kv = 0;
    const key = 68;
    const val = 1337;

    const ptr_ = await libMemoryKV.scenario1(kv, key, val);

    assert(!ptr_.isZero());
  });

  it("should return memory kv store as a uint256 array", async function () {
    const kv = 0;
    const key = 68;
    const val = 1337;

    const array_ = await libMemoryKV.scenario0(kv, key, val);
    const expectedArray = [key, val];

    expectedArray.forEach((expectedItem, i_) => {
      assert(
        ethers.BigNumber.from(expectedItem).eq(array_[i_]),

        `wrong item in uint256 array
        expected  ${ethers.BigNumber.from(expectedItem)}
        got       ${array_[i_]}
        index     ${i_}`
      );
    });
  });

  it("should set a value", async function () {
    const kv = 0;
    const key = 68;
    const val = 1337;

    const tx0_ = await libMemoryKV.setVal(kv, key, val);

    const { data: _memDumpBefore_ } = (await tx0_.wait()).events[0];
    const { data: memDumpAfter__ } = (await tx0_.wait()).events[1];
    const { data: kvSetVal_ } = (await tx0_.wait()).events[2];

    assert(
      kvSetVal_ ===
        "0x0000000000000000000000000000000000000000000000000000000000020080"
    );

    const ptr = numberify(readBytes(kvSetVal_, 30)); // final 2 bytes
    const len = numberify(readBytes(kvSetVal_, 0, 30)); // preceding bytes

    // using kvSetVal_ to determine what position in memDumpAfter__ to read from, we expect a linked list of 68, 1337, 0

    const list = readUint256BytesArrayFromMemDump(memDumpAfter__, ptr, len + 1);
    const expectedList = [key, val, 0];

    expectedList.forEach((expectedItem, i_) => {
      assert(
        ethers.BigNumber.from(expectedItem).eq(list[i_]),
        `wrong item in linked list
        expected  ${ethers.BigNumber.from(expectedItem)}
        got       ${list[i_]}
        index     ${i_}`
      );
    });
  });
});
