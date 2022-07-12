import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { paddedUInt256, paddedUInt32 } from "../../../utils/bytes";
import { max_uint32 } from "../../../utils/constants/bigNumber";
import { getBlockTimestamp } from "../../../utils/hardhat";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { compareTierReports } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report op", async function () {
  it("should return ITierV2 report when using opcode", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    const stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();
    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    // deploy a basic vm contract
    const logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    const setTierTimestamp = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
        op(Opcode.CONSTANT, 0), // ITierV2 contract
        op(Opcode.SENDER), // address
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
