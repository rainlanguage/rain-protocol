import * as Util from "../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  PhasedTest,
  PhaseScheduledEvent,
} from "../../typechain/PhasedTest";
import type { PhasedScheduleTest } from "../../typechain/PhasedScheduleTest";
import type { Contract } from "ethers";
import { blockTimestamp, timewarp } from "../../utils";

enum Phase {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

const max_uint32 = ethers.BigNumber.from("0xffffffff");

type PhaseTimes = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

describe("Phased", async function () {
  describe("Phase at timestamp calculates the correct phase for several timestamps", async function () {
    it("should return highest attained phase even if several phases have the same timestamp", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtTime(
        [0, 1, 2, 3, 3, 4, 5, 5],
        3
      );

      assert(highestPhase.eq(Phase.FIVE));
    });

    it("if every phase time is after the timestamp then phase zero is returned", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtTime(
        [100, 110, 120, 130, 140, 150, 160, 170],
        10
      );

      assert(highestPhase.eq(Phase.ZERO));
    });

    it("if every phase time is before the timestamp then phase EIGHT is returned", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtTime(
        [100, 110, 120, 130, 140, 150, 160, 170],
        200
      );

      assert(highestPhase.eq(Phase.EIGHT));
    });
  });

  describe("Schedule next phase", async function () {
    it("should have correct phase state (Phase X) in schedule phase hook, even if the next phase (Phase X + 1) has been set to the current timestamp", async function () {
      this.timeout(0);

      const phasedScheduleTest = (await Util.basicDeploy(
        "PhasedScheduleTest",
        {}
      )) as PhasedScheduleTest & Contract;

      assert(
        (await phasedScheduleTest.currentPhase()).eq(Phase.ZERO),
        `wrong phase after initialization, expected Phase.ZERO, got ${await phasedScheduleTest.currentPhase()}`
      );

      await phasedScheduleTest.testScheduleNextPhase();

      assert(
        (await phasedScheduleTest.currentPhase()).eq(Phase.ONE),
        "wrong phase, should have scheduled change to Phase.ONE at this timestamp"
      );
    });

    it("cannot schedule the next phase in the past", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const pastTimestamp = await blockTimestamp();

      await timewarp(1);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(pastTimestamp),
        "NEXT_TIME_PAST",
        "wrongly scheduled next phase in the past"
      );
    });

    it("cannot schedule the next phase if it is already scheduled", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const timestamp0 = await blockTimestamp();

      await phased.testScheduleNextPhase(timestamp0 + 10);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(timestamp0 + 15),
        "NEXT_TIME_SET",
        "wrongly scheduled next phase which was already scheduled"
      );
    });

    it("the next phase time must not be uninitialized", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const timestamp0 = await blockTimestamp();

      await phased.testScheduleNextPhase(timestamp0 + 10);

      assert(
        !max_uint32.eq(await phased.phaseTimes(0)),
        "next phase time was uninitialized"
      );
      assert(
        timestamp0 + 10 === (await phased.phaseTimes(0)),
        "next phase time was wrong"
      );
    });

    it("is not possible to skip a phase", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const timestamp0 = await blockTimestamp();

      await phased.testScheduleNextPhase(timestamp0 + 10);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(timestamp0 + 15),
        "NEXT_TIME_SET",
        "set a phase which was already initialized; skipped a phase"
      );
    });

    it("_beforeScheduleNextPhase hook can be used to impose conditions on phase changes", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const timestamp0 = await blockTimestamp();

      await phased.testScheduleNextPhase(timestamp0 + 1);

      await phased.toggleCondition(); // test method to turn on/off custom hook require

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(timestamp0 + 3),
        "CONDITION",
        "hook override could not be used to impose condition"
      );
    });
  });

  it("should handle phases on happy path", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

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

    const timestamp1 = (await blockTimestamp()) + 1;

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

  it("modifiers correctly error if current phase doesn't meet condition", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

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
    const timestamp1 = (await blockTimestamp()) + 1;
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
