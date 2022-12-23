import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { ONE } from "../../../utils/constants/bigNumber";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flowERC20/deploy";
import { flowERC20FactoryDeploy } from "../../../utils/deploy/flow/flowERC20/flowERC20Factory/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC20Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC20 construction tests", async function () {
  let flowERC20Factory: FlowERC20Factory;

  before(async () => {
    flowERC20Factory = await flowERC20FactoryDeploy();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2, ONE];

    // prettier-ignore
    const sourceCanTransfer = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.CONTEXT, 0x0001), // from
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // from
      op(Opcode.CONTEXT, 0x0001), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // native you->me amount

      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // BURN END
      op(Opcode.CONTEXT, 0x0001), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // burn amount

      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // MINT END
      op(Opcode.CONTEXT, 0x0001), // to
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // mint amount
    ]);

    const sources = [sourceCanTransfer];

    const configStruct: FlowERC20Config = {
      name: "Flow ERC20",
      symbol: "F20",
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

    const { flow } = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      configStruct
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(
      sender === flowERC20Factory.address,
      "wrong sender in Initialize event"
    );
    compareStructs(config, configStruct);
  });
});
