import { assert } from "chai";
import { BigNumber } from "ethers";
import { hexlify, keccak256, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  RevealEvent,
  SeedDanceTest,
  TimeBoundStruct,
} from "../../../typechain/SeedDanceTest";
import type { LibCommitmentTest } from "../../../typechain/LibCommitmentTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import { assertError } from "../../../utils";

describe("SeedDance reveal", async function () {
  let seedDance: SeedDanceTest;
  let libCommitment: LibCommitmentTest;

  before(async () => {
    libCommitment = (await basicDeploy(
      "LibCommitmentTest",
      {}
    )) as LibCommitmentTest;
  });

  beforeEach(async () => {
    seedDance = (await basicDeploy("SeedDanceTest", {})) as SeedDanceTest;
  });

  it("should calculate correct canRevealUntil timestamp (no extra time)", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second
    };

    const SEED = randomBytes(32);
    const START = BigNumber.from(await getBlockTimestamp());

    const canRevealUntil_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer1.address
    );

    assert(
      canRevealUntil_.eq(START.add(timeBound.baseDuration)),
      `wrong canRevealUntil timestamp
      expected  ${START.add(timeBound.baseDuration)}
      got       ${canRevealUntil_}`
    );
  });

  it("should calculate correct canRevealUntil timestamp (with extra time)", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 100, // we always lose a second
    };

    const SEED = randomBytes(32);
    const START = BigNumber.from(await getBlockTimestamp());

    const canRevealUntil_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer1.address
    );

    assert(
      canRevealUntil_.gt(START.add(timeBound.baseDuration)),
      `wrong canRevealUntil timestamp
      expected gt ${START.gt(timeBound.baseDuration)}
      got         ${canRevealUntil_}`
    );
  });

  it("should reveal the secret", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const initialSeed = randomBytes(32);
    const commitmentSecret = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    const sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(
      sharedSeed_.eq(initialSeed),
      "Shared seed is not set"
    );

    // revealing the secret
    const revealTx = await seedDance.connect(signer1).reveal(timeBound, commitmentSecret);

    const { sender: sender_, secret: secret_, newSeed: newSeed_ } = (await getEventArgs(
      revealTx,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed_) != hexlify(initialSeed),
      "Seed is not changed after reveal"
    );

    assert(
      sender_ === signer1.address,
      "Wrong signer in RevealEvent"
    );

    assert(
      hexlify(secret_) === hexlify(commitmentSecret),
      "Wrong secret revealed"
    );

  });

  it("should change the seed after every reveal", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];
    const signer3 = signers[3];

    const initialSeed = randomBytes(32);
    const commitmentSecret1 = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret1);
    const commitmentSecret2 = randomBytes(32);
    const commitment2 = keccak256(commitmentSecret2);
    const commitmentSecret3 = randomBytes(32);
    const commitment3 = keccak256(commitmentSecret3);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);
    await seedDance.connect(signer2).commit(commitment2);
    await seedDance.connect(signer3).commit(commitment3);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    let sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(
      sharedSeed_.eq(initialSeed),
      "Shared seed is not set"
    );

    // revealing the secret
    const revealTx1 = await seedDance.connect(signer1).reveal(timeBound, commitmentSecret1);

    const { sender: sender1_, secret: secret1_, newSeed: newSeed1_ } = (await getEventArgs(
      revealTx1,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed1_) != hexlify(initialSeed),
      "Seed is not changed after reveal"
    );

    assert(
      sender1_ === signer1.address,
      "Wrong signer in RevealEvent"
    );

    console.log(hexlify(secret1_), "\n", hexlify(commitmentSecret1))
    assert(
      hexlify(secret1_) === hexlify(commitmentSecret1),
      "Wrong secret revealed"
    );

    sharedSeed_ = await seedDance.sharedSeed();
    const revealTx2 = await seedDance.connect(signer2).reveal(timeBound, commitmentSecret2);
    const { sender: sender2_, secret: secret2_, newSeed: newSeed2_ } = (await getEventArgs(
      revealTx2,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed2_) != hexlify(sharedSeed_),
      "Seed is not changed after reveal"
    );

    assert(
      sender2_ === signer2.address,
      "Wrong signer in RevealEvent"
    );

    console.log(hexlify(secret2_), "\n", hexlify(commitmentSecret2))
    assert(
      hexlify(secret2_) === hexlify(commitmentSecret2),
      "Wrong secret revealed"
    );

    sharedSeed_ = await seedDance.sharedSeed();
    const revealTx3 = await seedDance.connect(signer3).reveal(timeBound, commitmentSecret3);

    const { sender: sender3_, secret: secret3_, newSeed: newSeed3_ } = (await getEventArgs(
      revealTx3,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed3_) != hexlify(sharedSeed_),
      "Seed is not changed after reveal"
    );

    assert(
      sender3_ === signer3.address,
      "Wrong signer in RevealEvent"
    );

    console.log(hexlify(secret3_), "\n", hexlify(commitmentSecret3))
    assert(
      hexlify(secret3_) === hexlify(commitmentSecret3),
      "Wrong secret revealed"
    );
  });

  it("reveal should be called only once by the sender", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const initialSeed = randomBytes(32);
    const commitmentSecret = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    const sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(
      sharedSeed_.eq(initialSeed),
      "Shared seed is not set"
    );

    // revealing the secret
    const revealTx = await seedDance.connect(signer1).reveal(timeBound, commitmentSecret);

    const { sender: sender_, secret: secret_, newSeed: newSeed_ } = (await getEventArgs(
      revealTx,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed_) != hexlify(initialSeed),
      "Seed is not changed after reveal"
    );

    assert(
      sender_ === signer1.address,
      "Wrong signer in RevealEvent"
    );

    assert(
      hexlify(secret_) === hexlify(commitmentSecret),
      "Wrong secret revealed"
    );

    // revealing the secret again
    await assertError(
      async () => {
        await seedDance.connect(signer1).reveal(timeBound, commitmentSecret);
      },
      "BAD_SECRET",
      "did not clear the commitment"
    );

  });

  it("signer should not be able to reveal once the time surpasses the base duration", async () => {
    const signers = await ethers.getSigners();
    const signer1 = signers[1];

    const initialSeed = randomBytes(32);
    const commitmentSecret = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second
    };

    // Starting the dance
    const startTx = await seedDance.start(initialSeed);
    const sharedSeed_ = await seedDance.sharedSeed();
    // Increasing the block time by 1 hour
    await timewarp(3600);

    // revealing the secret
    await assertError(
      async () => {
        await seedDance.connect(signer1).reveal(timeBound, commitmentSecret);
      },
      "CANT_REVEAL",
      "Secret was revealed even after the baseDuration was surpassed"
    );

  });

  it("canRevealUntil should change on every reveal", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];
    const signer3 = signers[3];

    const initialSeed = randomBytes(32);
    const commitmentSecret1 = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret1);
    const commitmentSecret2 = randomBytes(32);
    const commitment2 = keccak256(commitmentSecret2);
    const commitmentSecret3 = randomBytes(32);
    const commitment3 = keccak256(commitmentSecret3);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);
    await seedDance.connect(signer2).commit(commitment2);
    await seedDance.connect(signer3).commit(commitment3);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 10,
    };

    // Starting the dance
    const startTx = await seedDance.start(initialSeed);
    const startTime_ = (await ethers.provider.getBlock(startTx.blockNumber)).timestamp; // Getting the tx block timestamp
    const sharedSeed_ = await seedDance.sharedSeed();

    // =============================== Revealing the first secret
    let untilBefore_ = await seedDance.canRevealUntil(
      sharedSeed_,
      startTime_,
      timeBound,
      signer3.address
    )

    const revealTx1 = await seedDance.connect(signer1).reveal(timeBound, commitmentSecret1);

    const { sender: sender1_, secret: secret1_, newSeed: newSeed1_ } = (await getEventArgs(
      revealTx1,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    // Calculating until after reveal    
    let untilAfter_ = await seedDance.canRevealUntil(
      newSeed1_,
      startTime_,
      timeBound,
      signer3.address
    )

    assert(
      untilBefore_ != untilAfter_,
      "canRevealTimestamp was not changed after a reveal"
    );

    // ====================== Revealing Second secret

    // Calculating until before reveal
    untilBefore_ = await seedDance.canRevealUntil(
      sharedSeed_,
      startTime_,
      timeBound,
      signer3.address
    )
    const revealTx2 = await seedDance.connect(signer2).reveal(timeBound, commitmentSecret2);
    const { sender: sender2_, secret: secret2_, newSeed: newSeed2_ } = (await getEventArgs(
      revealTx2,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    // Calculating until after reveal    
    untilAfter_ = await seedDance.canRevealUntil(
      newSeed2_,
      startTime_,
      timeBound,
      signer3.address
    )

    assert(
      untilBefore_ != untilAfter_,
      "canRevealTimestamp was not changed after a reveal"
    );

  });

});
