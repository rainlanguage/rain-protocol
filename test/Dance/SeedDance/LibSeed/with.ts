import { assert } from "chai";
import { hexValue, hexZeroPad, randomBytes } from "ethers/lib/utils";
import type { LibSeedTest } from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";

describe("SeedDance LibSeed with", async function () {
  it("should generate new seed by hashing an existing seed with some value", async () => {
    const libSeed = (await basicDeploy("LibSeedTest", {})) as LibSeedTest;

    for (let i = 0; i < 100; i++) {
      const originalSeed = hexZeroPad(randomBytes(32), 32);
      const val = hexZeroPad(randomBytes(32), 32);

      const newSeed0 = hexZeroPad(
        hexValue(await libSeed.with(originalSeed, val)),
        32
      );

      assert(
        originalSeed !== newSeed0,
        "did not hash seed with val to produce new output seed"
      );

      const newSeed1 = hexZeroPad(
        hexValue(await libSeed.with(originalSeed, val)),
        32
      );

      assert(
        newSeed0 === newSeed1,
        "hashing seed with same val did not produce same output seed"
      );
    }
  });
});
