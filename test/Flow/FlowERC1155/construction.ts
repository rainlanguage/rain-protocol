import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC1155Factory, FlowIntegrity } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowERC1155ConfigStruct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flow";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC1155 construction tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC1155Factory: FlowERC1155Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC1155FactoryFactory = await ethers.getContractFactory(
      "FlowERC1155Factory",
      {}
    );
    flowERC1155Factory = (await flowERC1155FactoryFactory.deploy(
      integrity.address
    )) as FlowERC1155Factory;
    await flowERC1155Factory.deployed();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceRebaseRatio = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceCanTransfer = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceCanFlow = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // outputNative
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // inputNative
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel1155
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel1155
    ]);

    const sources = [sourceRebaseRatio, sourceCanTransfer];

    const configStruct: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [sourceCanFlow, sourceFlowIO], constants }],
    };

    const flow = await flowERC1155Deploy(
      deployer,
      flowERC1155Factory,
      configStruct
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(
      sender === flowERC1155Factory.address,
      "wrong sender in Initialize event"
    );

    compareStructs(config, configStruct);
  });
});
