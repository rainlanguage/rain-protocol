import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  PhasedTest,
  PhaseScheduledEvent,
} from "../../typechain/PhasedTest";
import * as Util from "../../utils";
import { getBlockTimestamp, max_uint32, timewarp } from "../../utils";
import { Phase, PhaseTimes } from "../../utils/types/phased";

describe("Phased test", async function () {
  it("should handle phases on happy path", async function () {
    const signers = await ethers.getSigners();

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest;

    // check constants

    const phaseTimes0: PhaseTimes = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 8; i++) {
      phaseTimes0[i] = await phased.phaseTimes(i);

      assert(
        max_uint32.eq(phaseTimes0[i]),
        `did not return max uint32 for phaseTimes(${i})`
      );
    }

    // pure functions behave correctly before any state changes occur

    const pABN0 = await phased.phaseAtTime(
      phaseTimes0,
      await ethers.provider.getBlockNumber()
    );

    assert(pABN0.eq(Phase.ZERO), "wrong initial phase");

    const bNFP0 = [
      await phased.timeForPhase(phaseTimes0, Phase.ZERO),
      await phased.timeForPhase(phaseTimes0, Phase.ONE),
      await phased.timeForPhase(phaseTimes0, Phase.TWO),
      await phased.timeForPhase(phaseTimes0, Phase.THREE),
      await phased.timeForPhase(phaseTimes0, Phase.FOUR),
      await phased.timeForPhase(phaseTimes0, Phase.FIVE),
      await phased.timeForPhase(phaseTimes0, Phase.SIX),
      await phased.timeForPhase(phaseTimes0, Phase.SEVEN),
      await phased.timeForPhase(phaseTimes0, Phase.EIGHT),
    ];

    bNFP0.forEach((timestamp, index) => {
      if (index) {
        assert(
          max_uint32.eq(timestamp),
          `phase time ${index - 1} should be uninitialised
          expected ${max_uint32} got ${timestamp}`
        );
      } else {
        assert(
          timestamp.eq(0),
          `should always return zero timestamp for zero phase
          expected ${0} got ${timestamp}`
        );
      }
    });

    const cP0 = await phased.currentPhase();

    assert(cP0.eq(0), "initial phase should be ZERO");

    assert(await phased.runsOnlyPhase(Phase.ZERO));
    assert(await phased.runsOnlyAtLeastPhase(Phase.ZERO));

    // should schedule next phase

    const timestamp1 = (await getBlockTimestamp()) + 1;

    const schedule1Promise = phased.testScheduleNextPhase(timestamp1);

    const event0 = (await Util.getEventArgs(
      await schedule1Promise,
      "PhaseScheduled",
      phased
    )) as PhaseScheduledEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.newPhase.eq(Phase.ONE), "wrong newPhase in event0");
    assert(
      event0.scheduledTime.eq(timestamp1),
      "wrong scheduledTime in event0"
    );

    await timewarp(1);

    const phaseTimes1: PhaseTimes = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 8; i++) {
      phaseTimes1[i] = await phased.phaseTimes(i);

      if (i) {
        assert(
          max_uint32.eq(phaseTimes1[i]),
          `did not return max uint32 for phaseTimes(${i})`
        );
      } else {
        assert(
          timestamp1 === phaseTimes1[i],
          `did not return correct phase time for phase ${i + 1}
          expected ${timestamp1} got ${phaseTimes1[i]}`
        );
      }
    }

    assert(await phased.runsOnlyPhase(Phase.ONE));
    assert(await phased.runsOnlyAtLeastPhase(Phase.ZERO));
    assert(await phased.runsOnlyAtLeastPhase(Phase.ONE));
  });

  // assert errors
  it("modifiers correctly error if current phase doesn't meet condition", async () => {
    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest;

    // onlyPhase
    assert(await phased.runsOnlyPhase(Phase.ZERO));
    await Util.assertError(
      async () => await phased.runsOnlyPhase(Phase.ONE),
      "BAD_PHASE",
      "onlyPhase did not error"
    );

    // onlyAtLeastPhase
    assert(await phased.runsOnlyAtLeastPhase(Phase.ZERO));
    await Util.assertError(
      async () => await phased.runsOnlyAtLeastPhase(Phase.ONE),
      "MIN_PHASE",
      "onlyAtLeastPhase did not error"
    );

    // schedule next phase
    const timestamp1 = (await getBlockTimestamp()) + 1;
    await phased.testScheduleNextPhase(timestamp1);

    await timewarp(1);

    // onlyPhase
    assert(await phased.runsOnlyPhase(Phase.ONE));
    await Util.assertError(
      async () => await phased.runsOnlyPhase(Phase.ZERO),
      "BAD_PHASE",
      "onlyPhase did not error"
    );
    await Util.assertError(
      async () => await phased.runsOnlyPhase(Phase.TWO),
      "BAD_PHASE",
      "onlyPhase did not error"
    );

    // onlyAtLeastPhase
    assert(await phased.runsOnlyAtLeastPhase(Phase.ZERO));
    assert(await phased.runsOnlyAtLeastPhase(Phase.ONE));
    await Util.assertError(
      async () => await phased.runsOnlyAtLeastPhase(Phase.TWO),
      "MIN_PHASE",
      "onlyAtLeastPhase did not error"
    );
  });
});
