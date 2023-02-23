import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { FlowERC20, FlowERC20ConfigStruct, InitializeEvent } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { EvaluableConfigStruct } from "../../../typechain/contracts/lobby/Lobby";
import { basicDeploy, zeroAddress } from "../../../utils";
import { ONE } from "../../../utils/constants/bigNumber";
import {  flowERC20Implementation } from "../../../utils/deploy/flow/flowERC20/deploy";
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
import { FlowERC20Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC20 construction tests", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2, ONE];

    // prettier-ignore
    const sourceCanTransfer = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.context, 0x0001), // from
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // from
      op(Opcode.context, 0x0001), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native you->me amount

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // BURN END
      op(Opcode.context, 0x0001), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // burn amount

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // MINT END
      op(Opcode.context, 0x0001), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // mint amount
    ]);

    const sources = [sourceCanTransfer];

    const flowERC20Config: FlowERC20Config = {
      name: "Flow ERC20",
      symbol: "F20",
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
    flowERC20Config.expressionConfig.sources,
    flowERC20Config.expressionConfig.constants
  );

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC20Config.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowERC20Config.flows[i].sources,
      flowERC20Config.flows[i].constants
    );
    flowConfig.push(evaluableConfig);
  }

  const flowERC20ConfigStruct: FlowERC20ConfigStruct = {
    evaluableConfig: evaluableConfig,
    flowConfig: flowConfig,
    name: flowERC20Config.name,
    symbol: flowERC20Config.symbol,
  };


  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(string name, string symbol, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] flowConfig)",
    ],
    [flowERC20ConfigStruct]
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
    "FlowERC20",
    cloneEvent.clone
  )) as FlowERC20; 

  const { sender, config } = (await getEventArgs(
    flowCloneTx,
    "Initialize",
    flow
  )) as InitializeEvent["args"];

    assert(
      sender === cloneFactory.address,
      "wrong sender in Initialize event"
    );
    compareStructs(config, flowERC20ConfigStruct);
  });
});
