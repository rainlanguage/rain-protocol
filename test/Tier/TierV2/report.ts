import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { paddedUInt256, paddedUInt32 } from "../../../utils/bytes";
import { max_uint32 } from "../../../utils/constants/bigNumber";
import { allStandardOpsDeploy } from "../../../utils/deploy/test/allStandardOps/deploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";
import { getBlockTimestamp } from "../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";
import { compareTierReports } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report op", async function () {
  it("should return ITierV2 report when using opcode", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const logic = await allStandardOpsDeploy();
    const readWriteTier = await readWriteTierDeploy();

    await readWriteTier.setTier(signer1.address, Tier.FOUR);
    const setTierTimestamp = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
      op(Opcode.ITIERV2_REPORT)
    ]);

    await logic.initialize({
      sources: [source],
      constants: [readWriteTier.address],
    });

    await logic.connect(signer1).run();
    const result = await logic.stackTop();

    const expectedReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(max_uint32).repeat(4) +
          paddedUInt32(setTierTimestamp).repeat(4)
      )
    );

    const actualReport = paddedUInt256(result);

    compareTierReports(expectedReport, actualReport);
  });
});
