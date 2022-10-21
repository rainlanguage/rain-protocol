import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOpsTest,
  ReadWriteTier,
  StandardIntegrity,
} from "../../../typechain";
import { getBlockTimestamp } from "../../../utils/hardhat";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { Tier } from "../../../utils/types/tier";
import { allStandardOpsDeploy } from "../../../utils/deploy/test/allStandardOps/deploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";

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
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.SENDER), // account
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);

    await logic.initialize({
      sources: [source],
      constants: [readWriteTier.address, Tier.FOUR],
    });

    await logic.connect(signer1).run();
    const result = await logic.stackTop();

    assert(
      result.eq(setTierTimestamp),
      "did not return correct timestamp for Tier.FOUR"
    );
  });
});
