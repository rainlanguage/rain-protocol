import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../../typechain";
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
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report time for tier op", async function () {
  it("should return ITierV2 report time for tier when using opcode", async () => {
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
        op(Opcode.CONTEXT, 0x0000), // account
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants: [readWriteTier.address, Tier.FOUR],
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, [
      [signer1.address],
    ]);
    const result = await logic.stackTop();

    assert(
      result.eq(setTierTimestamp),
      "did not return correct timestamp for Tier.FOUR"
    );
  });
});
