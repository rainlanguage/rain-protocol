import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flowERC1155/deploy";
import { flowERC1155FactoryDeploy } from "../../../utils/deploy/flow/flowERC1155/flowERC1155Factory/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC1155Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC1155 construction tests", async function () {
  let flowERC1155Factory: FlowERC1155Factory;

  before(async () => {
    flowERC1155Factory = await flowERC1155FactoryDeploy();
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

    const sources = [sourceCanTransfer];

    const configStruct: FlowERC1155Config = {
      uri: "F1155",
      stateConfig: {
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

    const { flow } = await flowERC1155Deploy(
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
