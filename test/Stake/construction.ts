import { assert } from "chai";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
  ReserveToken,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";

import {
  InitializeEvent,
  Stake,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import {
  generateEvaluableConfig,
  getRainMetaDocumentFromContract,
  max_uint16,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  stakeCloneDeploy,
  stakeImplementation,
  validateContractMetaAgainstABI,
} from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import { getTouchDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Stake construction", async function () {
  let implementation: Stake;
  let cloneFactory: CloneFactory;
  let token: ReserveToken;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await stakeImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should not initialize if requirements not met", async function () {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const constants = [max_uint256, max_uint16];
    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStructZeroToken: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: zeroAddress,
      evaluableConfig: evaluableConfig,
    };

    await assertError(
      async () =>
        await stakeCloneDeploy(
          deployer,
          cloneFactory,
          implementation,
          stakeConfigStructZeroToken
        ),
      "ZeroAsset()",
      "wrongly initialised Stake with token configured as 0 address"
    );
  });

  it("should initialize correctly on the good path", async function () {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const constants = [max_uint256, max_uint16];

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementation,
      stakeConfigStruct
    );

    const { sender, config } = (await getEventArgs(
      stake.deployTransaction,
      "Initialize",
      stake
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, stakeConfigStruct);
  });

  it("should fail if stake is deployed with bad callerMeta", async function () {
    const stakeFactory = await ethers.getContractFactory("Stake", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("stake"),
        deployer: touchDeployer.address,
      };

    const stake = (await stakeFactory.deploy(
      deployerDiscoverableMetaConfig0
    )) as Stake;

    assert(!(stake.address === zeroAddress), "stake did not deploy");

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () => await stakeFactory.deploy(deployerDiscoverableMetaConfig1),
      "UnexpectedMetaHash",
      "Stake Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("stake"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
