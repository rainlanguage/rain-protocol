import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { CloneFactory, RainterpreterExpressionDeployer } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { Flow, FlowConfigStruct, InitializeEvent } from "../../../typechain/contracts/flow/basic/Flow";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import { EvaluableConfigStruct } from "../../../typechain/contracts/lobby/Lobby";
import { assertError, basicDeploy, getRainContractMetaBytes, zeroAddress } from "../../../utils";
import {  flowImplementation } from "../../../utils/deploy/flow/basic/deploy";
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
import {  compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow construction tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.context, 0x0001), // from
      op(Opcode.context, 0x0000), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.context, 0x0000), // from
      op(Opcode.context, 0x0001), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native you->me amount
    ]);

    const flowConfig: FlowConfig = {
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
        {
          sources: [sourceFlowIO],
          constants,
        },
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    }; 

    const evaluableConfigs: EvaluableConfigStruct[] = [];

    // Building config
    for (let i = 0; i < flowConfig.flows.length; i++) {
      const evaluableConfig = await generateEvaluableConfig(
        flowConfig.flows[i].sources,
        flowConfig.flows[i].constants
      );
      evaluableConfigs.push(evaluableConfig);
    }

    const flowConfigStruct: FlowConfigStruct = {
      dummyConfig: evaluableConfigs[0], // this won't be used anywhere https://github.com/ethereum/solidity/issues/13597
      config: evaluableConfigs,
    };  

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(tuple(address deployer,bytes[] sources,uint256[] constants) dummyConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] config)",
      ],
      [flowConfigStruct]
    ); 

    const flowClone = await cloneFactory.clone(
      implementation.address,
      encodedConfig
    );
  
    const cloneEvent = (await getEventArgs(
      flowClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];  

    assert(!(cloneEvent.clone === zeroAddress), "flow clone zero address"); 

    const flow = (await ethers.getContractAt(
      "Flow",
      cloneEvent.clone
    )) as Flow; 


    const {sender, config } = (await getEventArgs(
      flowClone,
      "Initialize",
      flow
    )) as InitializeEvent["args"]; 

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");     
    compareStructs(config, flowConfigStruct);

  }); 

  it("should fail if flow is deployed with bad callerMeta", async function () {  

    const flowFactory = await ethers.getContractFactory("Flow", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer(); 

    const interpreterCallerConfig0: InterpreterCallerV1ConstructionConfigStruct = {
      callerMeta: getRainContractMetaBytes("flow"),
      deployer: touchDeployer.address,
    };

    const flow = (await flowFactory.deploy(interpreterCallerConfig0)) as Flow;

    assert(!(flow.address === zeroAddress), "flow did not deploy");  

    const interpreterCallerConfig1: InterpreterCallerV1ConstructionConfigStruct = {
      callerMeta: getRainContractMetaBytes("orderbook"),
      deployer: touchDeployer.address,
    }; 

    await assertError(
      async () =>
      await flowFactory.deploy(interpreterCallerConfig1),
      "UnexpectedMetaHash",
      "Flow Deployed for bad hash"
    )
    
  });  

});
