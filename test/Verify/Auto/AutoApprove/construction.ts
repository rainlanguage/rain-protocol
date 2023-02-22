import { assert } from "chai";
import { ethers } from "hardhat";
import { CloneFactory, Verify } from "../../../../typechain";
import { NewCloneEvent } from "../../../../typechain/contracts/factory/CloneFactory";
import { EvaluableConfigStruct } from "../../../../typechain/contracts/lobby/Lobby";
import {
  AutoApprove,
  AutoApproveConfigStruct,
  InitializeEvent,
} from "../../../../typechain/contracts/verify/auto/AutoApprove";
import { basicDeploy, zeroAddress } from "../../../../utils";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import {
  autoApproveCloneDeploy,
  autoApproveImplementation,
} from "../../../../utils/deploy/verify/auto/autoApprove/deploy";
import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../../utils/test/compareStructs";

describe("AutoApprove construction", async function () {
  let implementAutoApprove: AutoApprove;
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementAutoApprove = await autoApproveImplementation();
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should construct and initialize correctly", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];

    const expressionConfig = {
      sources: [op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const evaluableConfig: EvaluableConfigStruct =
      await generateEvaluableConfig(
        expressionConfig.sources,
        expressionConfig.constants
      );

    const initalConfig: AutoApproveConfigStruct = {
      owner: deployer.address,
      evaluableConfig: evaluableConfig,
    };

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address owner, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [initalConfig]
    );

    const autoApproveClone = await cloneFactory.clone(
      implementAutoApprove.address,
      encodedConfig
    );

    const cloneEvent = (await getEventArgs(
      autoApproveClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    assert(
      !(cloneEvent.clone === zeroAddress),
      "Clone autoApprove factory zero address"
    );

    const autoApprove = (await ethers.getContractAt(
      "AutoApprove",
      cloneEvent.clone
    )) as AutoApprove;

    const { sender, config } = (await getEventArgs(
      autoApproveClone,
      "Initialize",
      autoApprove
    )) as InitializeEvent["args"];
    assert(sender === cloneFactory.address, "wrong sender");
    compareStructs(config, expressionConfig);
  });

  it("can be configured as verify callback contract", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];

    const expressionConfig = {
      sources: [op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveCloneDeploy(
      cloneFactory,
      implementAutoApprove,
      deployer,
      expressionConfig.sources,
      expressionConfig.constants
    );

    await verifyCloneDeploy(
      cloneFactory,
      implementVerify,
      admin.address,
      autoApprove.address
    );
  });
});
