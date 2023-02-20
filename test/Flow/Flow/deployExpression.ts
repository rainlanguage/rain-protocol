import { assert } from "chai";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory } from "../../../typechain";
import { ContextEvent } from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { SignedContextStruct } from "../../../typechain/contracts/lobby/Lobby";
import { getEventArgs, getEvents } from "../../../utils";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow deployExpression tests", async function () {
  let flowFactory: FlowFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    flowFactory = await flowFactoryDeploy();
  });

  it("should deploy expression", async function () {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const _flow = await flowDeploy(deployer, flowFactory, flowConfigStruct);
  });

  it("should validate context from the context event", async () => {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await flowDeploy(deployer, flowFactory, flowConfigStruct);

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const context0 = [1, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await alice.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
      {
        signer: alice.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    const _txFlow0 = await flow
      .connect(alice)
      .flow(flowInitialized[0].evaluable, [1234], signedContexts0);

    const expectedContext0 = [
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(flow.address),
      ],
      [ethers.BigNumber.from(1234)],
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(alice.address),
      ],
      [
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(2),
        ethers.BigNumber.from(3),
      ],
      [
        ethers.BigNumber.from(4),
        ethers.BigNumber.from(5),
        ethers.BigNumber.from(6),
      ],
    ];

    const { sender: sender0, context: context0_ } = (await getEventArgs(
      _txFlow0,
      "Context",
      flow
    )) as ContextEvent["args"];

    assert(sender0 === alice.address, "wrong sender");
    for (let i = 0; i < expectedContext0.length; i++) {
      const rowArray = expectedContext0[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context0_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                       expected  ${colElement}
                       got       ${context0_[i][j]}`);
        }
      }
    }
  });
});
