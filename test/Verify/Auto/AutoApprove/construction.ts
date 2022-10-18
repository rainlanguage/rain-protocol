import { assert } from "chai";
import { ethers } from "hardhat";
import { AutoApproveFactory } from "../../../../typechain";
import {
  InitializeEvent,
  StateConfigStruct,
} from "../../../../typechain/contracts/verify/auto/AutoApprove";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/autoApprove";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify";
import { getEventArgs } from "../../../../utils/events";
import { Opcode } from "../../../../utils/interpreter/ops/autoApproveOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../../utils/test/compareStructs";

describe("AutoApprove construction", async function () {
  let autoApproveFactory: AutoApproveFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  it("should construct and initialize correctly", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const { sender, config } = (await getEventArgs(
      autoApprove.deployTransaction,
      "Initialize",
      autoApprove
    )) as InitializeEvent["args"];
    assert(sender === autoApproveFactory.address, "wrong sender");
    compareStructs(config, stateConfig);
  });

  it("can be configured as verify callback contract", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verifyFactory = await verifyFactoryDeploy();
    await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });
  });
});
