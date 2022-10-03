import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory, FlowIntegrity } from "../../../typechain";
import {
  FlowConfigStruct,
  InitializeEvent,
} from "../../../typechain/contracts/flow/raw/Flow";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("Flow construction tests", async function () {
  let integrity: FlowIntegrity;
  let flowFactory: FlowFactory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowFactoryFactory = await ethers.getContractFactory(
      "FlowFactory",
      {}
    );
    flowFactory = (await flowFactoryFactory.deploy(
      integrity.address
    )) as FlowFactory;
    await flowFactory.deployed();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceCanFlow = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceFlowIO = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // outputNative
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // inputNative
    ]);

    const sources = [sourceCanFlow, sourceFlowIO];

    const flowConfigStruct: FlowConfigStruct = {
      stateConfig: { sources, constants },
      flows: [],
    };

    const flow = await flowDeploy(deployer, flowFactory, flowConfigStruct);

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === flowFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowConfigStruct);
  });
});
