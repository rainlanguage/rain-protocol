import { assert } from "chai";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  SeedDanceTest,
  StartEvent,
} from "../../../typechain/SeedDanceTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { assertError } from "../../../utils/test/assertError";

describe("SeedDance start", async function () {
  let seedDance: SeedDanceTest;

  beforeEach(async () => {
    seedDance = (await basicDeploy("SeedDanceTest", {})) as SeedDanceTest;
  });

  it("should start", async () => {
    const signers = await ethers.getSigners();

    const initialSeed = randomBytes(32);

    const txStart = await seedDance.start(initialSeed);

    const { sender: sender_, initialSeed: initialSeed_ } = (await getEventArgs(
      txStart,
      "Start",
      seedDance
    )) as StartEvent["args"];

    assert(sender_ === signers[0].address, "wrong signer in Start event");
    assert(
      hexlify(initialSeed_) === hexlify(initialSeed),
      "wrong signer in Start event"
    );

    const sharedSeed_ = await seedDance.sharedSeed();

    assert(sharedSeed_.eq(initialSeed), "did not set shared seed");
  });

  it("should only start once", async () => {
    const initialSeed = randomBytes(32);

    await seedDance.start(initialSeed);

    await assertError(
      async () => {
        await seedDance.start(initialSeed);
      },
      "STARTED",
      "did not prevent start call after start had already been called once"
    );
  });
});
