import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { IInterpreterCallerConsumer } from "../../../typechain";

import {
  ExpressionAddressEvent,
  NewExpressionEvent,
} from "../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import {
  areEqualExpressionConfigs,
  assertError,
  getEventArgs,
  getRainContractMetaBytes,
  getRainMetaDocumentFromContract,
} from "../../../utils";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import {
  DeployerDiscoverableMetaV1ConstructionConfigStruct,
  MetaV1Event,
} from "../../../typechain/contracts/factory/CloneFactory";

describe("Caller Test", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should ensure that caller deploy transaction reverts if CALLER_META_HASH does not match config hash", async function () {
    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const lobbyContractMeta = getRainMetaDocumentFromContract("sale");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("lobby"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () =>
        await callerFactory.deploy(
          lobbyContractMeta,
          deployerDiscoverableMetaConfig
        ),
      "UnexpectedMetaHash",
      "Deployed with incorrect Meta Hash"
    );
  });

  it("should ensure caller is deployed with correct data for Meta event ", async function () {
    const signers = await ethers.getSigners();

    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const stakeContractMeta = getRainMetaDocumentFromContract("stake");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: stakeContractMeta,
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      stakeContractMeta,
      deployerDiscoverableMetaConfig
    )) as IInterpreterCallerConsumer;

    const { sender, meta } = (await getEventArgs(
      caller.deployTransaction,
      "MetaV1",
      caller
    )) as MetaV1Event["args"];

    assert(sender == signers[0].address, "Incorrect Sender");
    assert(meta == stakeContractMeta, "Incorrect Meta Hash");
  });

  it("should deploy touch expression with correct config", async function () {
    const signers = await ethers.getSigners();

    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const stakeContractMeta = getRainMetaDocumentFromContract("stake");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: stakeContractMeta,
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      stakeContractMeta,
      deployerDiscoverableMetaConfig
    )) as IInterpreterCallerConsumer;

    const deployTouchExpression = await caller.deployTouchExpression(
      touchDeployer.address
    );

    const newExpression = (await getEventArgs(
      deployTouchExpression,
      "NewExpression",
      touchDeployer
    )) as NewExpressionEvent["args"];

    const expectedExpression = {
      sender: signers[0].address,
      constants: [],
      sources: [],
      minOutputs: [],
    };

    const actualExpression = {
      sender: signers[0].address,
      constants: newExpression.constants,
      sources: newExpression.sources,
      minOutputs: newExpression.minOutputs,
    };

    assert(
      areEqualExpressionConfigs(expectedExpression, actualExpression),
      `wrong state config
      expected  ${expectedExpression}
      got       ${actualExpression}`
    );

    const expressionAddress = (await getEventArgs(
      deployTouchExpression,
      "ExpressionAddress",
      touchDeployer
    )) as ExpressionAddressEvent["args"];

    assert(expressionAddress.sender == caller.address, "Incorrect Sender");
  });

  it("should ensure checkCallerMeta fails if contract meta hashes are different", async function () {
    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const stakeContractMeta = getRainMetaDocumentFromContract("stake");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: stakeContractMeta,
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      stakeContractMeta,
      deployerDiscoverableMetaConfig
    )) as IInterpreterCallerConsumer;

    await assertError(
      async () =>
        await caller.checkMeta(
          getRainMetaDocumentFromContract("sale"),
          getRainMetaDocumentFromContract("lobby")
        ),
      "UnexpectedMetaHash",
      "Incorrect Meta Hash"
    );

    const correctHash = await caller.checkMeta(
      getRainMetaDocumentFromContract("lobby"),
      getRainMetaDocumentFromContract("lobby")
    );

    assert(correctHash, "Incorrect Meta Hash");
  });

  it("should ensure checkCallerMeta fails if contract meta hashes are invalid rain meta", async function () {
    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const stakeContractMeta = getRainMetaDocumentFromContract("stake");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: stakeContractMeta,
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      stakeContractMeta,
      deployerDiscoverableMetaConfig
    )) as IInterpreterCallerConsumer;

    // getRainDocumentsFromContract does not return cbor encoded bytes
    await assertError(
      async () =>
        await caller.checkMeta(
          getRainContractMetaBytes("stake"),
          getRainContractMetaBytes("stake")
        ),
      "NotRainMetaV1",
      "Incorrect Rain Hash"
    );
  });

  it("should ensure that contract meta is valid RainMeta", async function () {
    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const stakeContractMeta = getRainMetaDocumentFromContract("stake");

    const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: stakeContractMeta,
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      stakeContractMeta,
      deployerDiscoverableMetaConfig
    )) as IInterpreterCallerConsumer;

    const validRainMetaV1 = await caller.checkIsRainMetaV1(
      getRainMetaDocumentFromContract("stake")
    );

    const inValidRainMetaV1 = await caller.checkIsRainMetaV1(
      getRainContractMetaBytes("stake")
    );

    assert(validRainMetaV1, "Valid RainMeta");
    assert(!inValidRainMetaV1, "InValid RainMeta");
  });
});
