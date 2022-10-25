import { assert } from "chai";
import { hexValue, randomBytes } from "ethers/lib/utils";
import type { LibSeedTest } from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";

describe("SeedDance LibSeed with", async function () {
  it("should generate new seed by hashing an existing seed with some value", async () => {
    const libSeed = (await basicDeploy("LibSeedTest", {})) as LibSeedTest;

    for (let i = 0; i < 100; i++) {
      const originalSeed = hexValue(randomBytes(32));
      const val = hexValue(randomBytes(32));

      const newSeed0 = hexValue(await libSeed.with(originalSeed, val));

      assert(
        originalSeed !== newSeed0,
        "did not hash seed with val to produce new output seed"
      );

      const newSeed1 = hexValue(await libSeed.with(originalSeed, val));

      assert(
        newSeed0 === newSeed1,
        "hashing seed with same val did not produce same output seed"
      );
    }
  });
});
