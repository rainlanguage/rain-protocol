import { assert } from "chai";
import { ethers } from "hardhat";
import { AutoApproveFactory, VerifyFactory } from "../../../../typechain";
import {
  InitializeEvent,
  
} from "../../../../typechain/contracts/verify/auto/AutoApprove";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/verify/auto/autoApprove/deploy";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../../utils/test/compareStructs";

describe("AutoApprove construction", async function () {
  let autoApproveFactory: AutoApproveFactory;
  let verifyFactory: VerifyFactory;

  before(async () => { 

    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);  


    autoApproveFactory = await autoApproveFactoryDeploy();
    verifyFactory = await verifyFactoryDeploy();
  });

  it("should construct and initialize correctly", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];

    const expressionConfig = {
      sources: [op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      expressionConfig.sources,
      expressionConfig.constants
    );

    const { sender, config } = (await getEventArgs(
      autoApprove.deployTransaction,
      "Initialize",
      autoApprove
    )) as InitializeEvent["args"];
    assert(sender === autoApproveFactory.address, "wrong sender");
    compareStructs(config, expressionConfig);
  });

  it("can be configured as verify callback contract", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];

    const expressionConfig = {
      sources: [op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      expressionConfig.sources,
      expressionConfig.constants
    );

    await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });
  });
});
