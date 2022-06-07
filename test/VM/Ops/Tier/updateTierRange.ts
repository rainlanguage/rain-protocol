import { Contract } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { createEmptyBlock } from "../../../../utils/hardhat";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";
import { NEVER } from "../../../../utils/tier";
import { Tier } from "../../../../utils/types/tier";

const Opcode = AllStandardOps;

/**
 * Generates operand for UPDATE_TIMES_FOR_TIER_RANGE by specifying the range of tiers to be updated. Equivalent to `Util.tierRange` without guards for testing `MAX_TIER` error.
 * @see /utils/tier/index.ts
 * @param startTier
 * @param endTier
 * @returns Tier range, for use as operand
 */
function tierRangeUnrestricted(startTier: number, endTier: number): number {
  //   op_.val & 0x0f, //     00001111
  //   op_.val & 0xf0, //     11110000
  let range = endTier;
  range <<= 4;
  range += startTier;
  return range;
}

describe("RainVM update tier range op", async function () {
  let stateBuilder: AllStandardOpsStateBuilder & Contract;
  let logic: AllStandardOpsTest & Contract;

  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder &
        Contract;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest & Contract;
  });

  it("should enforce maxTier for update tier range operation", async () => {
    this.timeout(0);

    await createEmptyBlock(3);

    const block = await ethers.provider.getBlockNumber();

    const constants0 = [block, NEVER];

    const vBlock = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const source0 = concat([
        op(Opcode.CONSTANT, 1),
        vBlock,
      op(
        Opcode.UPDATE_TIMES_FOR_TIER_RANGE,
        tierRangeUnrestricted(Tier.ZERO, 9) // beyond max tier of Tier.EIGHT
      ),
    ]);

    await logic.initialize({
      sources: [source0],
      constants: constants0,
    });

    await assertError(
      async () => await logic.run(),
      "MAX_TIER",
      "wrongly updated blocks with endTier of 9, which is greater than maxTier constant"
    );
  });
});
