import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { allStandardOpsDeploy } from "../../../utils/deploy/test/allStandardOps/deploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp } from "../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report time for tier op", async function () {
  it("should return ITierV2 report time for tier when using opcode", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const logic = await allStandardOpsDeploy();
    const readWriteTier = await readWriteTierDeploy();

    await readWriteTier.setTier(signer1.address, Tier.FOUR);
    const setTierTimestamp = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // account
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants: [readWriteTier.address, Tier.FOUR],
      },
      [1]
    );

    await logic.connect(signer1).run();
    const result = await logic.stackTop();

    assert(
      result.eq(setTierTimestamp),
      "did not return correct timestamp for Tier.FOUR"
    );
  });
});
