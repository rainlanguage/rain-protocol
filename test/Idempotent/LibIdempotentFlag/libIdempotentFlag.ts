import { assert } from "chai";
import { ethers } from "hardhat";
import type { LibIdempotentFlagTest } from "../../../typechain";

enum FlagIndex {
  ZERO,
  ONE,
  TWO,
  THREE,
}

describe("LibIdempotentFlag tests", async function () {
  let libIdempotentFlag: LibIdempotentFlagTest;

  before(async () => {
    const libIdempotentFlagFactory = await ethers.getContractFactory(
      "LibIdempotentFlagTest"
    );
    libIdempotentFlag =
      (await libIdempotentFlagFactory.deploy()) as LibIdempotentFlagTest;
  });

  it("should set and get flags at various indices", async function () {
    const flagSet0 = await libIdempotentFlag.set(10, FlagIndex.ZERO);
    const flagSet1 = await libIdempotentFlag.set(20, FlagIndex.ONE);
    const flagSet2 = await libIdempotentFlag.set(30, FlagIndex.TWO);
    const flagSet3 = await libIdempotentFlag.set(40, FlagIndex.THREE);

    const flagGet0 = await libIdempotentFlag.get(flagSet0, FlagIndex.ZERO);
    const flagGet1 = await libIdempotentFlag.get(flagSet1, FlagIndex.ONE);
    const flagGet2 = await libIdempotentFlag.get(flagSet2, FlagIndex.TWO);
    const flagGet3 = await libIdempotentFlag.get(flagSet3, FlagIndex.THREE);

    assert(flagGet0);
    assert(flagGet1);
    assert(flagGet2);
    assert(flagGet3);
  });

  it("should set and get a flag at 0 index", async function () {
    const flagSet0 = await libIdempotentFlag.set(17, FlagIndex.ZERO);
    assert(flagSet0.eq(17));

    const flagGet0 = await libIdempotentFlag.get(flagSet0, FlagIndex.ZERO);
    assert(flagGet0);

    // not set
    const flagGet1 = await libIdempotentFlag.get(flagSet0, FlagIndex.ONE);
    assert(!flagGet1);
  });
});
