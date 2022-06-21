import { assert } from "chai";
import type { Contract } from "ethers";
import type { RandomTest } from "../../typechain/RandomTest";
import { basicDeploy } from "../../utils/deploy/basic";

describe("Random Micro lottery", async function () {
  it("should return a value for the micro lottery", async function () {
    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    const max = 30;
    for (const seed of [
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
    ]) {
      console.log({ seed });
      const arr = [];
      for (let n = 0; n < max; n++) {
        await random.microLottery(seed, max, n);
        arr.push((await random.item()).toString());
      }
      const set = new Set(arr);
      console.log({ arr, set });
      assert(set.size === arr.length, "set and array different length");
      assert(arr.length === max, "array not length of max");
      for (let j = 0; j < max; j++) {
        assert(set.has(j + ""), `item missing: ${j}`);
      }
    }
  });
});
