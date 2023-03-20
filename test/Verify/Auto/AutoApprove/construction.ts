import { assert } from "chai";
import { ethers } from "hardhat";
import { CloneFactory, Verify } from "../../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct, NewCloneEvent } from "../../../../typechain/contracts/factory/CloneFactory";
import { EvaluableConfigStruct } from "../../../../typechain/contracts/lobby/Lobby";
import {
  AutoApprove,
  AutoApproveConfigStruct,
  InitializeEvent,
} from "../../../../typechain/contracts/verify/auto/AutoApprove";
import {
  assertError,
  basicDeploy,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../../../utils";
import { flowCloneFactory } from "../../../../utils/deploy/factory/cloneFactory";
import { getTouchDeployer } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
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
    cloneFactory = await flowCloneFactory();
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

    const [, deployer, admin] = signers;

    const expressionConfig = {
      sources: [op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0))],
      constants: [1],
    };

    const autoApprove = await autoApproveCloneDeploy(
      deployer,
      cloneFactory,
      implementAutoApprove,
      deployer,
      expressionConfig.sources,
      expressionConfig.constants
    );

    await verifyCloneDeploy(
      deployer,
      cloneFactory,
      implementVerify,
      admin.address,
      autoApprove.address
    );
  });

  it("should fail when deploying with bad callerMeta", async () => {
    const contractFactory = await ethers.getContractFactory("AutoApprove");

    const touchDeployer = await getTouchDeployer();

    const config_0: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
      meta: getRainMetaDocumentFromContract("autoapprove"),
      deployer: touchDeployer.address,
    };

    const autoApprove = (await contractFactory.deploy(config_0)) as AutoApprove;
    await autoApprove.deployed();

    assert(!(autoApprove.address === zeroAddress), "autoApprove not deployed");

    const config_1: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
      meta: getRainMetaDocumentFromContract("orderbook"),
      deployer: touchDeployer.address,
    };

    await assertError(
      async () => await contractFactory.deploy(config_1),
      "UnexpectedMetaHash",
      "AutoApprove Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("autoapprove"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
