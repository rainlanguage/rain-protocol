import { strict as assert } from "assert";
import type { RandomTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { range } from "../../../utils/range";

describe("Random shuffle", async function () {
  let random: RandomTest;

  beforeEach(async () => {
    random = (await basicDeploy("RandomTest", {})) as RandomTest;
  });

  it("should shuffle an array", async function () {
    for (const length of [1, 10, 50, 100, 1000, 10000, 12000]) {
      const shuffled_ = (await random.callStatic.shuffle(5, length)).slice(2);
      const shuffledArray_ = [];
      for (let i = 0; i < shuffled_.length; i += 4) {
        shuffledArray_.push(parseInt(shuffled_.substring(i, i + 4), 16));
      }

      assert(
        shuffledArray_.length === length,
        "shuffled array was not correct length"
      );

      const unshuffled = range(0, length - 1);
      shuffledArray_.forEach((item) => {
        const unshuffledIndex = unshuffled.indexOf(item);
        if (unshuffledIndex === -1) {
          throw new Error(`Could not find index of item ${item}`);
        }
        unshuffled.splice(unshuffledIndex, 1);
      });

      assert(
        !unshuffled.length,
        "shuffled array did not contain one of each number in the range"
      );
    }
  });
});
