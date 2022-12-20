import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../../typechain";
import { paddedUInt256, paddedUInt32 } from "../../../utils/bytes";
import { max_uint32 } from "../../../utils/constants/bigNumber";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
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
  it.only("should return ITierV2 report when using opcode", async () => {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];

    const rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    const logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
    const readWriteTier = await readWriteTierDeploy();

    await readWriteTier.setTier(signer1.address, Tier.FOUR);
    const setTierTimestamp = await getBlockTimestamp();

    // prettier-ignore
    const source = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
      op(Opcode.CONTEXT, 0x0001), // this address
      op(Opcode.ITIERV2_REPORT)
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants: [readWriteTier.address],
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, [
      [signer1.address],
    ]);
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
