import { assert } from "chai";
import type { Contract } from "ethers";
import type { RandomTest } from "../../../typechain/RandomTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { prettyPrintMatrix } from "../../../utils/output/log";

describe("Random Micro lottery", async function () {
  xit("should shuffle an array randomly", async function () {
    // We want to test the probability that element i is placed at
    // position j after the shuffle. It should be the same for all
    // elements i, to a 3-sigma degree of statistical confidence.

    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    const MAX_N = 50; // size of array to shuffle
    const SEEDS = 8000; // number of times to shuffle
    const startingSeed = Math.round(Math.random() * 1000000);

    /// GENERATION

    const arrayOfShuffled: number[][] = Array(SEEDS).fill([]);
    for (let seed = startingSeed; seed < SEEDS + startingSeed; seed++) {
      const shuffled: number[] = Array(MAX_N).fill(null);
      for (let n = 0; n < MAX_N; n++) {
        const item = await random.microLottery(seed, MAX_N, n);
        shuffled[n] = item.toNumber();
      }
      console.log(`shuffled ${seed - startingSeed + 1} of ${SEEDS}`);
      arrayOfShuffled[seed] = shuffled;
    }

    /// ANALYSIS

    // initialize matrices
    const pMatrix = []; // probabilities
    const dMatrix = []; // squared deviations from mean
    const zMatrix = []; // Z-scores
    for (let i = 0; i < MAX_N; i++) {
      pMatrix.push([]);
      dMatrix.push([]);
      zMatrix.push([]);
      for (let j = 0; j < MAX_N; j++) {
        pMatrix[i].push(null);
        dMatrix[i].push(null);
        zMatrix[i].push(null);
      }
    }

    const probExpected = 1 / MAX_N;
    const meanProbability = probExpected; // mean is known

    console.log("creating matrices");

    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        const count_i_at_j = arrayOfShuffled.reduce(
          (runningTotal, shuffled) => {
            return runningTotal + (shuffled[j] === i ? 1 : 0);
          },
          0
        );

        const prob_i_at_j = count_i_at_j / SEEDS;
        const sq_deviation_i_at_j = Math.pow(prob_i_at_j - probExpected, 2);

        pMatrix[i][j] = prob_i_at_j;
        dMatrix[i][j] = sq_deviation_i_at_j;
      }
    }

    // unfold deviations in order to calculate variance and pop. st. dev.
    const sqDeviations = [];
    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        sqDeviations.push(dMatrix[i][j]);
      }
    }

    console.log("calculating variance");

    const variance =
      sqDeviations.reduce((prev, curr) => prev + curr) / Math.pow(MAX_N, 2);

    console.log("calculating population standard deviation");

    const popStDev = Math.sqrt(variance);

    console.log("calculating Z-scores");

    // calculate standard scores (Z-score)
    const outliers = [];
    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        const z_score_i_at_j = (pMatrix[i][j] - meanProbability) / popStDev;

        // greater than 3 st. dev.
        if (Math.abs(z_score_i_at_j) > 3)
          outliers.push({ i, j, z_score_i_at_j });

        zMatrix[i][j] = z_score_i_at_j;
      }
    }

    const zScoresUnfolded = [];
    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        zScoresUnfolded.push(zMatrix[i][j]);
      }
    }

    console.log("formatting matrices");

    // format matrices for log
    for (let i = 0; i < MAX_N; i++) {
      for (let j = 0; j < MAX_N; j++) {
        pMatrix[i][j] = pMatrix[i][j].toString();
        zMatrix[i][j] = zMatrix[i][j].toString();
      }
    }

    console.log("Probabilities:");
    prettyPrintMatrix(pMatrix);
    console.log("Z-scores:");
    prettyPrintMatrix(zMatrix);
    console.log("array length", MAX_N);
    console.log("number of seeds ('runs')", SEEDS);
    console.log("starting seed", startingSeed);
    console.log("expected probability (pop. mean)", probExpected);
    console.log("variance", variance);
    console.log("population st. dev.", popStDev);

    if (outliers.length) {
      outliers.forEach(({ i, j, z_score_i_at_j }) => {
        console.log(`outlier at i: ${i}, j: ${j}, z-score: ${z_score_i_at_j}`);
      });

      // for a normal distribution expect up to 0.27% of results to be beyond 3
      // standard deviations
      if (outliers.length / Math.pow(MAX_N, 2) > 0.0027) {
        throw new Error(
          "too many Z-score outliers beyond 3 standard deviations"
        );
      }
    }
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

  it.only("shuffle", async function () {
    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    console.log("shuffle 10000");
    await random.shuffle(5, 10000);
    await random.shuffledId(5392);
    await random.shuffledId(2000);

    console.log("shuffle 1000");
    await random.shuffle(60, 1000);
    await random.shuffledId(523);
    await random.shuffledId(192);
    // await random.store(shuffled)

    console.log("random");
    await random.randomId(5, 20204);
    await random.randomId(8, 1000000);
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
