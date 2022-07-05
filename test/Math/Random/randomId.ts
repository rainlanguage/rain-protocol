import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import type { RandomTest } from "../../../typechain/RandomTest";
import { max_uint256 } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";

describe("Random randomId", async function () {
  let random: RandomTest;

  beforeEach(async () => {
    random = (await basicDeploy("RandomTest", {})) as RandomTest;
  });

  it("should return random id, which can be reproduced with the same seed", async () => {
    const id0_ = await random.callStatic.randomId(5, 20204);
    const id1_ = await random.callStatic.randomId(5, 20204);

    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
    assert(id0_.eq(id1_), "same seed did not reproduce the same id");
  });

  it("should support index up to maximum uint256", async () => {
    const maxIndex = max_uint256;
    const id0_ = await random.callStatic.randomId(5, maxIndex);

    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
  });

  it("should support zero index", async () => {
    const id0_ = await random.callStatic.randomId(5, 0);

    assert(hexlify(id0_).length === 2 + 64, "unexpected id length");
  });
});
