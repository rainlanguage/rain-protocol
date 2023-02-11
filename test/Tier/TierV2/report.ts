import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../../typechain";
import { zeroPad32, paddedUInt32 } from "../../../utils/bytes";
import { max_uint32 } from "../../../utils/constants/bigNumber";
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
import { compareTierReports } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

describe("TierV2 report op", async function () { 
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0])
   }) 
  it("should return ITierV2 report when using opcode", async () => {
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
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
      op(Opcode.context, 0x0000), // signer1 address
      op(Opcode.itierV2Report)
    ]);

    const expression0 = await expressionConsumerDeploy(
      
         [source],
         [readWriteTier.address],
    
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[signer1.address]]
    );
    const result = await logic.stackTop();

    const expectedReport = zeroPad32(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(max_uint32).repeat(4) +
          paddedUInt32(setTierTimestamp).repeat(4)
      )
    );

    const actualReport = zeroPad32(result);

    compareTierReports(expectedReport, actualReport);
  });
});
