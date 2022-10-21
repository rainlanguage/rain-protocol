import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory } from "../../../typechain";
import {
  FlowConfigStruct,
  InitializeEvent,
} from "../../../typechain/contracts/flow/basic/Flow";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import { flowDeploy } from "../../../utils/deploy/flow/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("Flow construction tests", async function () {
  let flowFactory: FlowFactory;

  before(async () => {
    flowFactory = await flowFactoryDeploy();
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
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.THIS_ADDRESS), // from
      op(Opcode.SENDER), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.SENDER), // from
      op(Opcode.THIS_ADDRESS), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // native you->me amount
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfigStruct = {
      stateConfig: { sources, constants },
      flows: [{ sources: [sourceCanFlow, sourceFlowIO], constants }],
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
