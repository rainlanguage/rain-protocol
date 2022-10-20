import { assert } from "chai";
import { hexlify, keccak256, randomBytes } from "ethers/lib/utils";
import type { LibCommitmentTest } from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";

describe("SeedDance LibCommitment", async function () {
  let libCommitment: LibCommitmentTest;

  before(async () => {
    libCommitment = (await basicDeploy(
      "LibCommitmentTest",
      {}
    )) as LibCommitmentTest;
  });

  it("should check commitment equality", async () => {
    for (let i = 0; i < 100; i++) {
      // commitments
      const a_0 = hexlify(randomBytes(32));
      const b_0 = hexlify(randomBytes(32));

      const eq0 = await libCommitment.eq(a_0, b_0);
      assert(!eq0, "equality returned false positive");

      const eq1 = await libCommitment.eq(a_0, a_0);
      assert(eq1, "equality returned false negative");
    }
  });

  it("should produce commitment from secret in the `fromSecret` EXAMPLE IMPLEMENTATION where the secret is hashed", async () => {
    const secret = hexlify(randomBytes(32));
    const commitment = hexlify(await libCommitment.fromSecret(secret));
    const expectedCommitment = keccak256(secret);

    assert(
      commitment === expectedCommitment,
      "did not hash secret with keccak256 hash function"
    );
  });

  it("should return nil commitment", async () => {
    const nil = await libCommitment.nil();
    assert(nil.isZero());
  });
});
