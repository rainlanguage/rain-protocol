import { assert } from "chai";
import { hexlify, randomBytes } from "ethers/lib/utils";
import type { LibSeedTest } from "../../../../typechain/LibSeedTest";
import { basicDeploy } from "../../../../utils/deploy/basic";

describe("SeedDance LibSeed with", async function () {
  it("should generate new seed by hashing an existing seed with some value", async () => {
    const libSeed = (await basicDeploy("LibSeedTest", {})) as LibSeedTest;

    for (let i = 0; i < 100; i++) {
      const originalSeed = hexlify(randomBytes(32));
      const val = hexlify(randomBytes(32));

      const newSeed0 = hexlify(await libSeed.with(originalSeed, val));

      assert(
        originalSeed !== newSeed0,
        "did not hash seed with val to produce new output seed"
      );

      const newSeed1 = hexlify(await libSeed.with(originalSeed, val));

      assert(
        newSeed0 === newSeed1,
        "hashing seed with same val did not produce same output seed"
      );
    }
  });
});
