import { assert } from "chai";
import { BigNumber } from "ethers";
import { keccak256, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  RevealEvent,
  SeedDanceTest,
  TimeBoundStruct,
} from "../../../typechain/SeedDanceTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { getBlockTimestamp } from "../../../utils/hardhat";

describe("SeedDance reveal", async function () {
  let seedDance: SeedDanceTest;

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
});
