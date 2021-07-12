import * as Util from "./Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { PhasedTest } from "../typechain/PhasedTest";

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

describe("Phased", async function () {
  it("should phase", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const phased = (await Util.basicDeploy("PhasedTest", {})) as PhasedTest;

    assert(
      max_uint32.eq(await phased.UNINITIALIZED()),
      "did not return max uint32"
    );

    for (let i = 0; i < 8; i++) {
      assert(
        max_uint32.eq(await phased.phaseBlocks(i)),
        `did not return max uint32 for phaseBlocks(${i})`
      );
    }
  });
});
