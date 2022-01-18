import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { PhasedTest } from "../../typechain/PhasedTest";
import type { PhasedScheduleTest } from "../../typechain/PhasedScheduleTest";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { Contract } from "ethers";

chai.use(solidity);
const { expect, assert } = chai;

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

type PhaseBlocks = [
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
  describe("Phase at block number calculates the correct phase for several block numbers", async function () {
    it("should return highest attained phase even if several phases have the same block number", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtBlockNumber(
        [0, 1, 2, 3, 3, 4, 5, 5],
        3
      );

      assert(highestPhase.eq(Phase.FIVE));
    });

    it("if every phase block is after the block number then phase zero is returned", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtBlockNumber(
        [100, 110, 120, 130, 140, 150, 160, 170],
        10
      );

      assert(highestPhase.eq(Phase.ZERO));
    });

    it("if every phase block is before the block number then phase EIGHT is returned", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const highestPhase = await phased.phaseAtBlockNumber(
        [100, 110, 120, 130, 140, 150, 160, 170],
        200
      );

      assert(highestPhase.eq(Phase.EIGHT));
    });
  });

  describe("Schedule next phase", async function () {
    it("should have correct phase state (Phase X) in schedule phase hook, even if the next phase (Phase X + 1) has been set to the current block", async function () {
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
        "wrong phase, should have scheduled change to Phase.ONE at this block"
      );
    });

    it("cannot schedule the next phase in the past", async function () {
      this.timeout(0);

      const signers = await ethers.getSigners();

      const reserve = (await Util.basicDeploy(
        "ReserveToken",
        {}
      )) as ReserveToken & Contract;

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const pastBlock = await ethers.provider.getBlockNumber();

      // empty block
      await reserve.transfer(signers[0].address, 0);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(pastBlock),
        "NEXT_BLOCK_PAST",
        "wrongly scheduled next phase in the past"
      );
    });

    it("cannot schedule the next phase if it is already scheduled", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const firstBlock = await ethers.provider.getBlockNumber();

      await phased.testScheduleNextPhase(firstBlock + 10);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(firstBlock + 15),
        "NEXT_BLOCK_SET",
        "wrongly scheduled next phase which was already scheduled"
      );
    });

    it("the next phase block must not be uninitialized", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const firstBlock = await ethers.provider.getBlockNumber();

      await phased.testScheduleNextPhase(firstBlock + 10);

      assert(
        !max_uint32.eq(await phased.phaseBlocks(0)),
        "next phase block was uninitialized"
      );
      assert(
        firstBlock + 10 === (await phased.phaseBlocks(0)),
        "next phase block was wrong"
      );
    });

    it("is not possible to skip a phase", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const firstBlock = await ethers.provider.getBlockNumber();

      await phased.testScheduleNextPhase(firstBlock + 10);

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(firstBlock + 15),
        "NEXT_BLOCK_SET",
        "set a block which was already initialized; skipped a phase"
      );
    });

    it("_beforeScheduleNextPhase hook can be used to impose conditions on phase changes", async function () {
      this.timeout(0);

      const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
        Contract;

      const firstBlock = await ethers.provider.getBlockNumber();

      await phased.testScheduleNextPhase(firstBlock + 1);

      await phased.toggleCondition(); // test method to turn on/off custom hook require

      await Util.assertError(
        async () => await phased.testScheduleNextPhase(firstBlock + 3),
        "CONDITION",
        "hook override could not be used to impose condition"
      );
    });
  });

  it("should handle phases on happy path", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

    // check constants

    const phaseBlocks0: PhaseBlocks = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 8; i++) {
      phaseBlocks0[i] = await phased.phaseBlocks(i);

      assert(
        max_uint32.eq(phaseBlocks0[i]),
        `did not return max uint32 for phaseBlocks(${i})`
      );
    }

    // pure functions behave correctly before any state changes occur

    const pABN0 = await phased.phaseAtBlockNumber(
      phaseBlocks0,
      await ethers.provider.getBlockNumber()
    );

    assert(pABN0.eq(Phase.ZERO), "wrong initial phase");

    const bNFP0 = [
      await phased.blockNumberForPhase(phaseBlocks0, Phase.ZERO),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.ONE),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.TWO),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.THREE),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.FOUR),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.FIVE),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.SIX),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.SEVEN),
      await phased.blockNumberForPhase(phaseBlocks0, Phase.EIGHT),
    ];

    bNFP0.forEach((blockNumber, index) => {
      if (index) {
        assert(
          max_uint32.eq(blockNumber),
          `phase block ${index - 1} should be uninitialised
          expected ${max_uint32} got ${blockNumber}`
        );
      } else {
        assert(
          blockNumber.eq(0),
          `should always return zero block number for zero phase
          expected ${0} got ${blockNumber}`
        );
      }
    });

    const cP0 = await phased.currentPhase();

    assert(cP0.eq(0), "initial phase should be ZERO");

    assert(await phased.runsOnlyPhase(Phase.ZERO));
    assert(await phased.runsOnlyAtLeastPhase(Phase.ZERO));

    // should schedule next phase

    const block1 = (await ethers.provider.getBlockNumber()) + 1;

    const schedule1Promise = phased.testScheduleNextPhase(block1);

    expect(schedule1Promise)
      .to.emit(phased, "PhaseScheduled")
      .withArgs(signers[0].address, Phase.ONE, block1);
    await schedule1Promise;

    // empty block
    await reserve.transfer(signers[0].address, 0);

    const phaseBlocks1: PhaseBlocks = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 8; i++) {
      phaseBlocks1[i] = await phased.phaseBlocks(i);

      if (i) {
        assert(
          max_uint32.eq(phaseBlocks1[i]),
          `did not return max uint32 for phaseBlocks(${i})`
        );
      } else {
        assert(
          block1 === phaseBlocks1[i],
          `did not return correct phase block for phase ${i + 1}
          expected ${block1} got ${phaseBlocks1[i]}`
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

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

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
    const block1 = (await ethers.provider.getBlockNumber()) + 1;
    await phased.testScheduleNextPhase(block1);

    // empty block
    await reserve.transfer(signers[0].address, 0);

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
