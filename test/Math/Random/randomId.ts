import { strict as assert } from "assert";
import { BigNumberish } from "ethers";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { RandomTest } from "../../../typechain";
import { zeroPad32 } from "../../../utils";
import { max_uint256 } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";

/**
 * Calculate the exact same output from randomId function since is just a keccak256 hash from `_seed` + `_index`
 */
function getRandomId(_seed: BigNumberish, _index: BigNumberish): string {
  const _arr = [_seed, _index].map((elem) =>
    zeroPad32(ethers.BigNumber.from(elem))
  );
  return ethers.utils.keccak256(ethers.utils.hexConcat(_arr));
}

describe("Random randomId", async function () {
  let random: RandomTest;

  beforeEach(async () => {
    random = (await basicDeploy("RandomTest", {})) as RandomTest;
  });

  it("should return random id, which can be reproduced with the same seed", async () => {
    const _seed = 5;
    const _index = 20204;
    const id0_ = await random.callStatic.randomId(5, 20204);
    const id1_ = await random.callStatic.randomId(5, 20204);

    const expectedId0_ = getRandomId(_seed, _index);

    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
    assert(hexlify(id0_) === expectedId0_, "wrong id generated");
    assert(id0_.eq(id1_), "same seed did not reproduce the same id");
  });

  it("should support index up to maximum uint256", async () => {
    const _seed = 5;
    const maxIndex = max_uint256;

    const id0_ = await random.callStatic.randomId(_seed, maxIndex);
    const expectedId0_ = getRandomId(_seed, maxIndex);

    assert(hexlify(id0_) === expectedId0_, "wrong id generated");
    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
  });

  it("should support zero index", async () => {
    const _seed = 5;
    const _index = 0;

    const id0_ = await random.callStatic.randomId(_seed, _index);
    const expectedId0_ = getRandomId(_seed, _index);

    assert(hexlify(id0_) === expectedId0_, "wrong id generated");
    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
  });
});
