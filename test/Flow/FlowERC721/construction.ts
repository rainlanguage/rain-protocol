import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC721Factory, FlowIntegrity } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { FlowERC721ConfigStruct } from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { flowERC721Deploy } from "../../../utils/deploy/flow/flow";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC721 construction tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC721Factory: FlowERC721Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC721FactoryFactory = await ethers.getContractFactory(
      "FlowERC721Factory",
      {}
    );
    flowERC721Factory = (await flowERC721FactoryFactory.deploy(
      integrity.address
    )) as FlowERC721Factory;
    await flowERC721Factory.deployed();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceCanTransfer = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceCanFlow = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceFlowIO = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // NATIVE SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel721
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // sentinel721
    ]);

    const sources = [sourceCanTransfer];

    const configStruct: FlowERC721ConfigStruct = {
      name: "Flow ERC721",
      symbol: "F721",
      vmStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [sourceCanFlow, sourceFlowIO], constants }],
    };

    const flow = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
      configStruct
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(
      sender === flowERC721Factory.address,
      "wrong sender in Initialize event"
    );

    compareStructs(config, configStruct);
  });
});
