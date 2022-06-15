import { assert } from "chai";
import type { Contract } from "ethers";
import type { PhasedScheduleTest } from "../../typechain/PhasedScheduleTest";
import type { PhasedTest } from "../../typechain/PhasedTest";
import * as Util from "../../utils";
import { getBlockTimestamp, max_uint32, timewarp } from "../../utils";
import { Phase } from "../../utils/types/phased";

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

    const pastTimestamp = await getBlockTimestamp();

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

    const timestamp0 = await getBlockTimestamp();

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

    const timestamp0 = await getBlockTimestamp();

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

    const timestamp0 = await getBlockTimestamp();

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

    const timestamp0 = await getBlockTimestamp();

    await phased.testScheduleNextPhase(timestamp0 + 1);

    await phased.toggleCondition(); // test method to turn on/off custom hook require

    await Util.assertError(
      async () => await phased.testScheduleNextPhase(timestamp0 + 3),
      "CONDITION",
      "hook override could not be used to impose condition"
    );
  });
});
