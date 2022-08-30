import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOpsTest,
  ReadWriteTier,
  StandardIntegrity,
} from "../../../typechain";
import { getBlockTimestamp } from "../../../utils/hardhat";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report time for tier op", async function () {
  it("should return ITierV2 report time for tier when using opcode", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    const integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();
    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    // deploy a basic vm contract
    const logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

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
