import { assert } from "chai";
import { BigNumber } from "ethers";
import { hexlify, keccak256, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { LibSeedTest } from "../../../typechain/LibSeedTest";
import type {
  RevealEvent,
  SeedDanceTest,
  TimeBoundStruct,
} from "../../../typechain/SeedDanceTest";
import { assertError, kurtosis } from "../../../utils";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import {
  generateRandomWallet,
  getBlockTimestamp,
  timewarp,
} from "../../../utils/hardhat";

describe("SeedDance reveal", async function () {
  let seedDance: SeedDanceTest;

  beforeEach(async () => {
    seedDance = (await basicDeploy("SeedDanceTest", {})) as SeedDanceTest;
  });

  it("should clear out commitment", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const initialSeed = randomBytes(32);
    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
    };

    await seedDance.start(initialSeed);

    await seedDance.connect(signer1).reveal(timeBound, secret1);

    await assertError(
      async () => await seedDance.connect(signer1).reveal(timeBound, secret1),
      "BAD_SECRET",
      "did not clear commitment in prior reveal"
    );
  });

  it("should produce distinct additional reveal times, from `baseDuration` up to `maxExtraTime`, for each seed owner", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];
    const signer3 = signers[3];

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);
    const secret2 = randomBytes(32);
    const commitment2 = keccak256(secret2);
    const secret3 = randomBytes(32);
    const commitment3 = keccak256(secret3);

    await seedDance.connect(signer1).commit(commitment1);
    await seedDance.connect(signer2).commit(commitment2);
    await seedDance.connect(signer3).commit(commitment3);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1000000, // high number to reduce flakiness where canRevealUntil timestamps overlap, just so we can test that we are, in fact, getting a random spread of timestamps
    };

    const SEED = randomBytes(32);
    const START = BigNumber.from(await getBlockTimestamp());

    const canRevealUntil1_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer1.address
    );
    const canRevealUntil2_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer2.address
    );
    const canRevealUntil3_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer3.address
    );

    assert(
      !canRevealUntil1_.eq(canRevealUntil2_),
      "canRevealUntil 1,2 timestamps were wrongly equal"
    );
    assert(
      !canRevealUntil1_.eq(canRevealUntil3_),
      "canRevealUntil 1,3 timestamps were wrongly equal"
    );
    assert(
      !canRevealUntil2_.eq(canRevealUntil3_),
      "canRevealUntil 2,3 timestamps were wrongly equal"
    );

    assert(
      canRevealUntil1_.gte(START.add(timeBound.baseDuration)) &&
        canRevealUntil1_.lt(
          START.add(timeBound.baseDuration).add(timeBound.maxExtraTime)
        ),
      "signer1 has out-of-bounds canRevealTime"
    );
    assert(
      canRevealUntil2_.gte(START.add(timeBound.baseDuration)) &&
        canRevealUntil2_.lt(
          START.add(timeBound.baseDuration).add(timeBound.maxExtraTime)
        ),
      "signer2 has out-of-bounds canRevealTime"
    );
    assert(
      canRevealUntil3_.gte(START.add(timeBound.baseDuration)) &&
        canRevealUntil3_.lt(
          START.add(timeBound.baseDuration).add(timeBound.maxExtraTime)
        ),
      "signer3 has out-of-bounds canRevealTime"
    );
  });

  it("should calculate correct canRevealUntil timestamp if not started (return 0)", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 100, // we always lose a second, so need minimum of `1`
    };

    const SEED = randomBytes(32);
    const START = 0;

    const canRevealUntil_ = await seedDance.canRevealUntil(
      SEED,
      START,
      timeBound,
      signer1.address
    );

    assert(
      canRevealUntil_.isZero(),
      `wrong canRevealUntil timestamp
      expected  0
      got       ${canRevealUntil_}`
    );
  });

  it("should calculate correct canRevealUntil timestamp (no extra time)", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const secret1 = randomBytes(32);
    const commitment1 = keccak256(secret1);

    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
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
      maxExtraTime: 100, // we always lose a second, so need minimum of `1`
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
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    const sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(sharedSeed_.eq(initialSeed), "Shared seed is not set");

    // revealing the secret
    const revealTx = await seedDance
      .connect(signer1)
      .reveal(timeBound, commitmentSecret);

    const {
      sender: sender_,
      secret: secret_,
      newSeed: newSeed_,
    } = (await getEventArgs(
      revealTx,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed_) != hexlify(initialSeed),
      "Seed is not changed after reveal"
    );

    assert(sender_ === signer1.address, "Wrong signer in RevealEvent");

    assert(
      hexlify(secret_) === hexlify(commitmentSecret),
      "Wrong secret revealed"
    );
  });

  it("should change the shared seed after every reveal", async () => {
    const libSeed = (await basicDeploy("LibSeedTest", {})) as LibSeedTest;

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
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    const sharedSeed1_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(sharedSeed1_.eq(initialSeed), "Shared seed is not set");

    // revealing the secret
    const revealTx1 = await seedDance
      .connect(signer1)
      .reveal(timeBound, commitmentSecret1);

    const {
      sender: sender1_,
      secret: secret1_,
      newSeed: newSeed1_,
    } = (await getEventArgs(
      revealTx1,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed1_) != hexlify(initialSeed),
      "SharedSeed is not changed after reveal 1"
    );

    const expectedSeed1 = await libSeed.with(sharedSeed1_, commitmentSecret1);
    assert(
      hexlify(newSeed1_) === hexlify(expectedSeed1),
      "newSeed1_ was not produced with `LibSeed.with()`"
    );

    assert(sender1_ === signer1.address, "Wrong signer1 in RevealEvent");

    console.log(hexlify(secret1_), "\n", hexlify(commitmentSecret1));
    assert(
      hexlify(secret1_) === hexlify(commitmentSecret1),
      "Wrong secret1 revealed"
    );

    const sharedSeed2_ = await seedDance.sharedSeed();
    const revealTx2 = await seedDance
      .connect(signer2)
      .reveal(timeBound, commitmentSecret2);
    const {
      sender: sender2_,
      secret: secret2_,
      newSeed: newSeed2_,
    } = (await getEventArgs(
      revealTx2,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed2_) != hexlify(sharedSeed2_),
      "SharedSeed is not changed after reveal 2"
    );

    const expectedSeed2 = await libSeed.with(sharedSeed2_, commitmentSecret2);
    assert(
      hexlify(newSeed2_) === hexlify(expectedSeed2),
      "newSeed2_ was not produced with `LibSeed.with()`"
    );

    assert(sender2_ === signer2.address, "Wrong signer2 in RevealEvent");

    console.log(hexlify(secret2_), "\n", hexlify(commitmentSecret2));
    assert(
      hexlify(secret2_) === hexlify(commitmentSecret2),
      "Wrong secret2 revealed"
    );

    const sharedSeed3_ = await seedDance.sharedSeed();
    const revealTx3 = await seedDance
      .connect(signer3)
      .reveal(timeBound, commitmentSecret3);

    const {
      sender: sender3_,
      secret: secret3_,
      newSeed: newSeed3_,
    } = (await getEventArgs(
      revealTx3,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed3_) != hexlify(sharedSeed3_),
      "SharedSeed is not changed after reveal 3"
    );

    const expectedSeed3 = await libSeed.with(sharedSeed3_, commitmentSecret3);
    assert(
      hexlify(newSeed3_) === hexlify(expectedSeed3),
      "newSeed3_ was not produced with `LibSeed.with()`"
    );

    assert(sender3_ === signer3.address, "Wrong signer3 in RevealEvent");

    console.log(hexlify(secret3_), "\n", hexlify(commitmentSecret3));
    assert(
      hexlify(secret3_) === hexlify(commitmentSecret3),
      "Wrong secret3 revealed"
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
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    const sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(sharedSeed_.eq(initialSeed), "Shared seed is not set");

    // revealing the secret
    const revealTx = await seedDance
      .connect(signer1)
      .reveal(timeBound, commitmentSecret);

    const {
      sender: sender_,
      secret: secret_,
      newSeed: newSeed_,
    } = (await getEventArgs(
      revealTx,
      "Reveal",
      seedDance
    )) as RevealEvent["args"];

    assert(
      hexlify(newSeed_) != hexlify(initialSeed),
      "Seed is not changed after reveal"
    );

    assert(sender_ === signer1.address, "Wrong signer in RevealEvent");

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

  it("signer should not be able to reveal once the time surpasses the base duration and maxExtraTime", async () => {
    const signers = await ethers.getSigners();
    const signer1 = signers[1];

    const initialSeed = randomBytes(32);
    const commitmentSecret = randomBytes(32);
    const commitment1 = keccak256(commitmentSecret);

    // Committing the secret
    await seedDance.connect(signer1).commit(commitment1);

    const timeBound: TimeBoundStruct = {
      baseDuration: 3600,
      maxExtraTime: 3600,
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    await seedDance.sharedSeed();
    // Increasing the block time by baseDuration + maxExtraTime
    await timewarp(3600 * 2);

    // revealing the secret
    await assertError(
      async () => {
        await seedDance.connect(signer1).reveal(timeBound, commitmentSecret);
      },
      "CANT_REVEAL",
      "Secret was revealed even after the baseDuration + maxExtraTime was surpassed"
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
      baseDuration: 3600,
      maxExtraTime: 1, // we always lose a second, so need minimum of `1`
    };

    // Starting the dance
    await seedDance.start(initialSeed);
    await seedDance.sharedSeed();
    // Increasing the block time by baseDuration
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

  it("canRevealUntil should change on every reveal since sharedSeed changes", async () => {
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
    const startTime_ = (await ethers.provider.getBlock(startTx.blockNumber))
      .timestamp; // Getting the tx block timestamp
    const sharedSeed_ = await seedDance.sharedSeed();

    // =============================== Revealing the first secret
    let untilBefore_ = await seedDance.canRevealUntil(
      sharedSeed_,
      startTime_,
      timeBound,
      signer3.address
    );

    const revealTx1 = await seedDance
      .connect(signer1)
      .reveal(timeBound, commitmentSecret1);

    const { newSeed: newSeed1_ } = (await getEventArgs(
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
    );

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
    );
    const revealTx2 = await seedDance
      .connect(signer2)
      .reveal(timeBound, commitmentSecret2);
    const { newSeed: newSeed2_ } = (await getEventArgs(
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
    );

    assert(
      untilBefore_ != untilAfter_,
      "canRevealTimestamp was not changed after a reveal"
    );
  });

  it("it should generate a random distribution of extra times", async () => {
    const extraTimeArr = [];
    const MAX_ADDRESSES = 1000;
    const MAX_EXTRATIME = 10000;
    const initialSeed = randomBytes(32);

    const timeBound: TimeBoundStruct = {
      baseDuration: 60,
      maxExtraTime: MAX_EXTRATIME,
    };

    // Starting the dance
    const startTx = await seedDance.start(initialSeed);
    const startTime_ = (await ethers.provider.getBlock(startTx.blockNumber))
      .timestamp;
    const sharedSeed_ = await seedDance.sharedSeed();

    // Validating sharedSeed
    assert(sharedSeed_.eq(initialSeed), "Shared seed is not set");

    // Generating extraTime for random addresses
    for (let i = 0; i < MAX_ADDRESSES; i++) {
      const until_ = await seedDance.canRevealUntil(
        sharedSeed_,
        startTime_,
        timeBound,
        generateRandomWallet().address
      );

      const endTime = until_.toNumber();

      // Subtracting endTime by startTime_ and ignoring the baseDuration
      const extraTime_ =
        endTime -
        startTime_ -
        BigNumber.from(timeBound.baseDuration).toNumber();
      extraTimeArr.push(extraTime_);
    }

    // Calculating kurtosis for every addresses's extraTime
    const extraTimeKurtosis = kurtosis(extraTimeArr);
    assert(
      extraTimeKurtosis < 0,
      "canRevealUntil does not have a fair random distribution"
    );
  });
});
