import { assert } from "chai";
import type { Contract } from "ethers";
import type { RandomTest } from "../../typechain/RandomTest";
import { basicDeploy } from "../../utils/deploy/basic";
import { prettyPrintMatrix } from "../../utils/output/log";

describe("Random Micro lottery", async function () {
  xit("should return statistically even distribution", async function () {
    // We want to test the probability that element i is placed at
    // position j after the shuffle. It should be the same for all
    // elements i, to some degree of statistical confidence.

    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    const MAX_N = 10; // size of array to shuffle
    const SEEDS = 10000; // number of times to shuffle
    const startingSeed = Math.round(Math.random() * 1000000);
    const threshold = 0.005; // if probability for any position i,j exceeds threshold, test will fail

    const arrayOfShuffled: number[][] = [];

    // generation
    for (let seed = startingSeed; seed < SEEDS + startingSeed; seed++) {
      const shuffled: number[] = [];
      for (let n = 0; n < MAX_N; n++) {
        const item = await random.microLottery(seed, MAX_N, n);
        shuffled.push(item.toNumber());
      }
      console.log(`shuffled ${seed - startingSeed + 1} of ${SEEDS}`);
      arrayOfShuffled.push(shuffled);
    }

    // analysis
    const pMatrix = [];
    for (let i = 0; i < MAX_N; i++) {
      pMatrix.push([]);
      for (let j = 0; j < MAX_N; j++) {
        pMatrix[i].push(null);
      }
    }

    const probExpected = 1 / MAX_N;

    const errors = [];

    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        const count_i_at_j = arrayOfShuffled.reduce(
          (runningTotal, shuffled) => {
            return runningTotal + (shuffled[j] === i ? 1 : 0);
          },
          0
        );

        const prob_i_at_j = count_i_at_j / SEEDS;
        if (
          prob_i_at_j > probExpected + threshold ||
          prob_i_at_j < probExpected - threshold
        ) {
          errors.push({ i, j, p: prob_i_at_j });
        }
        pMatrix[i][j] = prob_i_at_j.toFixed(4);
      }
    }

    prettyPrintMatrix(pMatrix);
    console.log("array length", MAX_N);
    console.log("expected probability", probExpected);
    console.log("threshold", threshold);
    console.log("starting seed", startingSeed);
    console.log("number of seeds ('runs')", SEEDS);

    errors.forEach((error) => {
      console.log(error);
    });

    assert(
      !errors.length,
      `one or more probabilities exceeded threshold of ${threshold} for expected probability ${probExpected}`
    );
  });

  it("should generate the same array with the same seed", async function () {
    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    const MAX = 30;
    const SEED = 1000;

    const shuffled0 = [];
    for (let n = 0; n < MAX; n++) {
      const item = await random.microLottery(SEED, MAX, n);
      shuffled0.push(item.toNumber());
    }

    const shuffled1 = [];
    for (let n = 0; n < MAX; n++) {
      const item = await random.microLottery(SEED, MAX, n);
      shuffled1.push(item.toNumber());
    }

    assert(
      shuffled0.every((item, index) => item === shuffled1[index]),
      "arrays generated with same seed were not the same"
    );
  });

  it("should return a value for the micro lottery", async function () {
    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    const MAX_N = 30;

    for (const seed of [
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
    ]) {
      const shuffled = [];
      for (let n = 0; n < MAX_N; n++) {
        const item = await random.microLottery(seed, MAX_N, n);
        shuffled.push(item.toNumber());
      }

      const set = new Set(shuffled);

      assert(set.size === shuffled.length, "set and array different length");
      assert(shuffled.length === MAX_N, "array not length of max");
      for (let j = 0; j < MAX_N; j++) {
        assert(set.has(j), `item missing: ${j}`);
      }
    }
  });
});
