import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";

import {
  Flow,
  InitializeEvent,
} from "../../../typechain/contracts/flow/basic/Flow";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import {
  assertError,
  basicDeploy,
  getRainMetaDocumentFromContract,
  zeroAddress,
} from "../../../utils";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
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
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow construction tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const constants = [1, 2];

    // prettier-ignore
    // example source, only checking stack length in this test
    const sourceFlowIO = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC1155 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC721 SKIP
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ERC20 SKIP

      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // NATIVE END

      op(Opcode.context, 0x0001), // from
      op(Opcode.context, 0x0000), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native me->you amount

      op(Opcode.context, 0x0000), // from
      op(Opcode.context, 0x0001), // to
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // native you->me amount
    ]);

    const flowConfig: FlowConfig = {
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
        {
          sources: [sourceFlowIO],
          constants,
        },
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfig
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");
    compareStructs(config, flowConfig);
  });

  it("should fail if flow is deployed with bad callerMeta", async function () {
    const flowFactory = await ethers.getContractFactory("Flow", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const interpreterCallerConfig0: InterpreterCallerV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow"),
        deployer: touchDeployer.address,
      };

    const flow = (await flowFactory.deploy(interpreterCallerConfig0)) as Flow;

    assert(!(flow.address === zeroAddress), "flow did not deploy");

    const interpreterCallerConfig1: InterpreterCallerV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () => await flowFactory.deploy(interpreterCallerConfig1),
      "UnexpectedMetaHash",
      "Flow Deployed for bad hash"
    );
  });
});
