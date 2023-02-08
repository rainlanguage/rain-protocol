import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { createEmptyBlock } from "../../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
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

describe("RainInterpreter update tier range op", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should enforce maxTier for update tier range operation", async () => {
    await createEmptyBlock(3);

    const block = await ethers.provider.getBlockNumber();

    const constants0 = [block, NEVER];

    const vBlock = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );

    // prettier-ignore
    const source0 = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
        vBlock,
      op(
        Opcode.update_times_for_tier_range,
        tierRangeUnrestricted(Tier.ZERO, 9) // beyond max tier of Tier.EIGHT
      ),
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants: constants0,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "MAX_TIER",
      "wrongly updated blocks with endTier of 9, which is greater than maxTier constant"
    );
  });
});
