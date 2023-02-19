import { assert } from "chai";

import { ethers } from "hardhat";
import { IInterpreterCallerConsumer } from "../../../typechain";
import {
  InterpreterCallerMetaEvent,
  InterpreterCallerV1ConstructionConfigStruct,
} from "../../../typechain/contracts/flow/FlowCommon";
import {
  ExpressionAddressEvent,
  NewExpressionEvent,
} from "../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import {
  areEqualExpressionConfigs,
  assertError,
  getEventArgs,
  getRainContractMetaBytes,
} from "../../../utils";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";

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

    const metaHash_ = getRainContractMetaBytes("orderbook");

    const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("lobby"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () =>
        await callerFactory.deploy(metaHash_, interpreterCallerConfig),
      "UnexpectedMetaHash",
      "Incorrect Meta Hash"
    );
  });

  it("should ensure caller is deployed with correct data for InterpreterCallerMeta event ", async function () {
    const signers = await ethers.getSigners();

    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const metaHash_ = getRainContractMetaBytes("lobby");

    const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("lobby"),
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      metaHash_,
      interpreterCallerConfig
    )) as IInterpreterCallerConsumer;

    const { sender, callerMeta } = (await getEventArgs(
      caller.deployTransaction,
      "InterpreterCallerMeta",
      caller
    )) as InterpreterCallerMetaEvent["args"];

    assert(sender == signers[0].address, "Incorrect Sender");
    assert(callerMeta == metaHash_, "Incorrect Meta Hash");
  });

  it("should deploy touch expression with correct config", async function () {
    const signers = await ethers.getSigners();

    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const metaHash_ = getRainContractMetaBytes("lobby");

    const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("lobby"),
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      metaHash_,
      interpreterCallerConfig
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

  it("should ensure checkCallerMeta works as expected", async function () {
    const touchDeployer = await getTouchDeployer();

    const callerFactory = await ethers.getContractFactory(
      "IInterpreterCallerConsumer",
      {}
    );

    const metaHash_ = getRainContractMetaBytes("lobby");

    const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("lobby"),
        deployer: touchDeployer.address,
      };

    const caller = (await callerFactory.deploy(
      metaHash_,
      interpreterCallerConfig
    )) as IInterpreterCallerConsumer;

    await assertError(
      async () =>
        await caller.checkCallerMeta(
          getRainContractMetaBytes("orderbook"),
          getRainContractMetaBytes("lobby")
        ),
      "UnexpectedMetaHash",
      "Incorrect Meta Hash"
    );

    const correctHash = await caller.checkCallerMeta(
      getRainContractMetaBytes("lobby"),
      getRainContractMetaBytes("lobby")
    );

    assert(correctHash, "Incorrect Meta Hash");
  });
});
