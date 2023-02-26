import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";

import {
  FlowERC721,
  InitializeEvent,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import {
  assertError,
  basicDeploy,
  getRainContractMetaBytes,
  zeroAddress,
} from "../../../utils";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
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
  let cloneFactory: CloneFactory;
  let implementation: FlowERC721;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC721Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

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

    const flowERC721Config: FlowERC721Config = {
      name: "Flow ERC721",
      symbol: "F721",
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

    const { flow } = await flowERC721Clone(
      deployer,
      cloneFactory,
      implementation,
      flowERC721Config
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowERC721Config);
  });

  it("should fail if flowERC721 is deployed with bad callerMeta", async function () {
    const flowERC721Factory = await ethers.getContractFactory("FlowERC721", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const interpreterCallerConfig0: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("flow721"),
        deployer: touchDeployer.address,
      };

    const flowERC721 = (await flowERC721Factory.deploy(
      interpreterCallerConfig0
    )) as FlowERC721;

    assert(!(flowERC721.address === zeroAddress), "flowERC721 did not deploy");

    const interpreterCallerConfig1: InterpreterCallerV1ConstructionConfigStruct =
      {
        callerMeta: getRainContractMetaBytes("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () => await flowERC721Factory.deploy(interpreterCallerConfig1),
      "UnexpectedMetaHash",
      "FlowERC721 Deployed for bad hash"
    );
  });
});
