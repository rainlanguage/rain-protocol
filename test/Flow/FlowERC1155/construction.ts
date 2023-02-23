import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory, RainterpreterExpressionDeployer } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { FlowERC1155, FlowERC1155ConfigStruct, InitializeEvent } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import { EvaluableConfigStruct } from "../../../typechain/contracts/lobby/Lobby";
import { assertError, basicDeploy, getRainContractMetaBytes, zeroAddress } from "../../../utils";
import {  flowERC1155Implementation } from "../../../utils/deploy/flow/flowERC1155/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC1155Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC1155 construction tests", async function () {
  let implementation: FlowERC1155;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC1155Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceCanTransfer = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // outputNative
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // inputNative
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel1155
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // sentinel1155
    ]);

    const sources = [sourceCanTransfer];

    const flowERC1155Config: FlowERC1155Config = {
      uri: "F1155",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    };

    // Building evaluableConfig
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    flowERC1155Config.expressionConfig.sources,
    flowERC1155Config.expressionConfig.constants
  );

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC1155Config.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowERC1155Config.flows[i].sources,
      flowERC1155Config.flows[i].constants
    );
    flowConfig.push(evaluableConfig);
  }

  const flowERC1155ConfigStruct: FlowERC1155ConfigStruct = {
    evaluableConfig: evaluableConfig,
    flowConfig: flowConfig,
    uri: flowERC1155Config.uri,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(string uri, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] flowConfig)",
    ],
    [flowERC1155ConfigStruct]
  );

  const flowCloneTx = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const cloneEvent = (await getEventArgs(
    flowCloneTx,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"]; 

  

  assert(!(cloneEvent.clone === zeroAddress), "flow clone zero address");

  const flow = (await ethers.getContractAt(
    "FlowERC1155",
    cloneEvent.clone
  )) as FlowERC1155;

    const { sender, config } = (await getEventArgs(
      flowCloneTx,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(
      sender === cloneFactory.address,
      "wrong sender in Initialize event"
    );

    compareStructs(config, flowERC1155Config);
  }); 

  it("should fail if flowERC1155 is deployed with bad callerMeta", async function () {  

    const flowERC1155Factory = await ethers.getContractFactory("FlowERC1155", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer(); 

    const interpreterCallerConfig0: InterpreterCallerV1ConstructionConfigStruct = {
      callerMeta: getRainContractMetaBytes("flow1155"),
      deployer: touchDeployer.address,
    };

    const flowERC1155 = (await flowERC1155Factory.deploy(interpreterCallerConfig0)) as FlowERC1155;

    assert(!(flowERC1155.address === zeroAddress), "flowERC1155 did not deploy");  

    const interpreterCallerConfig1: InterpreterCallerV1ConstructionConfigStruct = {
      callerMeta: getRainContractMetaBytes("orderbook"),
      deployer: touchDeployer.address,
    }; 

    await assertError(
      async () =>
      await flowERC1155Factory.deploy(interpreterCallerConfig1),
      "UnexpectedMetaHash",
      "FlowERC1155 Deployed for bad hash"
    )
  }); 
});
