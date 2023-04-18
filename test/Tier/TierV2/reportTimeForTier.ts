import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../../typechain";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
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
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });
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
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.context, 0x0000), // account
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // tier
      op(Opcode.tier_v2_report_time_for_tier)
    ]);

    const expression0 = await expressionConsumerDeploy(
      [source],
      [readWriteTier.address, Tier.FOUR],

      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[signer1.address]]
    );
    const result = await logic.stackTop();

    assert(
      result.eq(setTierTimestamp),
      "did not return correct timestamp for Tier.FOUR"
    );
  });
});
