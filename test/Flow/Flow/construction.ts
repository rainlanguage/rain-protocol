import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FlowFactory } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/basic/Flow";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

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
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.CONTEXT, 0x0001), // from
      op(Opcode.CONTEXT, 0x0000), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.CONTEXT, 0x0000), // from
      op(Opcode.CONTEXT, 0x0001), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // native you->me amount
    ]);

    const sources = [];

    const flowConfig: FlowConfig = {
      expressionConfig: { sources, constants },
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    };

    const { flow } = await flowDeploy(deployer, flowFactory, flowConfig);

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === flowFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowConfig);
  });
});
