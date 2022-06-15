import { assert } from "chai";
import type { Contract } from "ethers";
import { ethers } from "hardhat";
import type { PhasedTest } from "../../typechain/PhasedTest";
import * as Util from "../../utils";

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

describe("Phase at timestamp calculates the correct phase for several timestamps", async function () {
  it("should return highest attained phase even if several phases have the same timestamp", async function () {
    this.timeout(0);

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

    const highestPhase = await phased.phaseAtTime([1, 2, 2, 2, 2, 2, 2, 3], 2);

    assert(highestPhase.eq(Phase.SEVEN));
  });

  it("if every phase time is after the timestamp then phase zero is returned", async function () {
    this.timeout(0);

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

    const highestPhase = await phased.phaseAtTime([2, 3, 4, 5, 6, 7, 8, 9], 1);

    assert(highestPhase.eq(Phase.ZERO));
  });

  it("if every phase time is before the timestamp then phase EIGHT is returned", async function () {
    this.timeout(0);

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest &
      Contract;

    const highestPhase = await phased.phaseAtTime([1, 2, 3, 4, 5, 6, 7, 8], 9);

    assert(highestPhase.eq(Phase.EIGHT));
  });
});
