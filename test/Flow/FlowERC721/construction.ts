import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC721Factory } from "../../../typechain";
import { InitializeEvent } from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { flowERC721Deploy } from "../../../utils/deploy/flow/flowERC721/deploy";
import { flowERC721FactoryDeploy } from "../../../utils/deploy/flow/flowERC721/flowERC721Factory/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC721Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC721 construction tests", async function () {
  let flowERC721Factory: FlowERC721Factory;

  before(async () => {
    flowERC721Factory = await flowERC721FactoryDeploy();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceCanSignContext = concat([
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
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // NATIVE END
      op(Opcode.THIS_ADDRESS), // from
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // from
      op(Opcode.THIS_ADDRESS), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // native you->me amount

      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // BURN END
      op(Opcode.THIS_ADDRESS), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // burn amount

      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // MINT END
      op(Opcode.THIS_ADDRESS), // to
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // mint amount
    ]);

    const sources = [sourceCanTransfer];

    const configStruct: FlowERC721Config = {
      name: "Flow ERC721",
      symbol: "F721",
      stateConfig: {
        sources,
        constants,
      },
      flows: [
        {
          sources: [sourceCanSignContext, sourceCanFlow, sourceFlowIO],
          constants,
        },
      ],
    };

    const { flow } = await flowERC721Deploy(
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
