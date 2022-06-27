import { assert } from "chai";
import type { Contract } from "ethers";
import type { RandomTest } from "../../../typechain/RandomTest";
import { basicDeploy } from "../../../utils/deploy/basic";

describe("Random shuffle", async function () {
  it("should randomly shuffle an array", async function () {
    const random = (await basicDeploy("RandomTest", {})) as RandomTest &
      Contract;

    // console.log("shuffle 10000");
    // await random.shuffle(5, 10000);
    // await random.shuffledId(5392);
    // await random.shuffledId(2000);

    // console.log("shuffle 1000");
    // await random.shuffle(60, 1000);
    // await random.shuffledId(523);
    // await random.shuffledId(192);
    // // await random.store(shuffled)

    // console.log("random");
    // await random.randomId(5, 20204);
    // await random.randomId(8, 1000000);

    const shuffled_ = (await random.callStatic.shuffle(5, 50)).slice(2);
    const shuffledArray_ = [];
    for (let i = 0; i < shuffled_.length; i += 4) {
      shuffledArray_.push(parseInt(shuffled_.substring(i, i + 4), 16));
    }

    console.log({ shuffledArray_ });
    console.log(shuffledArray_.length);
  });
});
