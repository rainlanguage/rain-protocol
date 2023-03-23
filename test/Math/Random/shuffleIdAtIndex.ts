import { assert } from "chai";
import type { RandomTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { assertError } from "../../../utils/test/assertError";

describe("Random shuffleIdAtIndex", async function () {
  let random: RandomTest;

  beforeEach(async () => {
    random = (await basicDeploy("RandomTest", {})) as RandomTest;
  });

  it("should not return shuffled id if no shuffled array has been stored", async () => {
    await assertError(
      async () => await random.callStatic.shuffleIdAtIndex(5392),
      `ReadError`,
      `did not error on oob index read`
    );
  });

  it("should not return shuffled id if index is out of range", async () => {
    const length = 50;

    await random.shuffle(5, length);

    await assertError(
      async () => await random.callStatic.shuffleIdAtIndex(5392),
      `ReadError`,
      `did not error on oob index read`
    );
  });

  it("should return shuffled id if index is within range", async () => {
    const length = 50;

    // run like this to actually write to storage
    await random.shuffle(5, length);

    // run like this to get `shuffled_` result
    const shuffled_ = (await random.callStatic.shuffle(5, length)).slice(2);
    const shuffledArray_ = [];
    for (let i = 0; i < shuffled_.length; i += 4) {
      shuffledArray_.push(parseInt(shuffled_.substring(i, i + 4), 16));
    }

    const id_ = await random.callStatic.shuffleIdAtIndex(25);

    assert(!id_.isZero(), "wrongly returned zero id when index in range");
    assert(id_.eq(shuffledArray_[25]), "wrong id at index");
  });
});
