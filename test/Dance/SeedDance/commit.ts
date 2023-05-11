import { strict as assert } from "assert";
import { keccak256, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { SeedDanceTest } from "../../../typechain";
import { CommitEvent } from "../../../typechain/contracts/dance/SeedDance";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../../utils/events";
import { assertError } from "../../../utils/test/assertError";

describe("SeedDance commit", async function () {
  let seedDance: SeedDanceTest;

  beforeEach(async () => {
    seedDance = (await basicDeploy("SeedDanceTest", {})) as SeedDanceTest;
  });

  it("should allow anybody to make commitments before start", async () => {
    const signers = await ethers.getSigners();

    const [, signer1, signer2] = signers;

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    const txCommit = await seedDance.connect(signer1).commit(commitment1);

    const { sender: sender_, commitment: commitment_ } = (await getEventArgs(
      txCommit,
      "Commit",
      seedDance
    )) as CommitEvent["args"];

    assert(sender_ === signer1.address, "wrong commit sender in Commit event");
    assert(commitment_.eq(commitment1), "wrong commitment in Commit event");

    const initialSeed = randomBytes(32);
    await seedDance.start(initialSeed);

    const secret2 = randomBytes(32);
    const commitment2 = keccak256(secret2);

    await assertError(
      async () => await seedDance.connect(signer2).commit(commitment2),
      "STARTED",
      "did not prevent commitment after already started"
    );
  });
});
