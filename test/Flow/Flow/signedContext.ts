import {
  arrayify,
  concat,
  hexlify,
  keccak256,
  solidityKeccak256,
} from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory, FlowIntegrity } from "../../../typechain";
import {
  FlowConfigStruct,
  SaveInterpreterStateEvent,
  SignedContextStruct,
} from "../../../typechain/contracts/flow/basic/Flow";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { getEvents } from "../../../utils/events";
import {
  bytify,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("Flow signed context tests", async function () {
  let integrity: FlowIntegrity;
  let flowFactory: FlowFactory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowFactoryFactory = await ethers.getContractFactory(
      "FlowFactory",
      {}
    );
    flowFactory = (await flowFactoryFactory.deploy(
      integrity.address
    )) as FlowFactory;
    await flowFactory.deployed();
  });

  it("should validate a signed context", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_SIGN_CONTEXT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfigStruct = {
      stateConfig: { sources, constants },
      flows: [
        { sources: [CAN_SIGN_CONTEXT(), CAN_FLOW(), sourceFlowIO], constants },
      ],
    };

    const flow = await flowDeploy(deployer, flowFactory, flowConfigStruct);

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

    const context = [1, 2, 3];
    const hash = solidityKeccak256(["uint256[]"], [context]);
    const signature = await you.signMessage(arrayify(hash));

    const signedContexts: SignedContextStruct[] = [
      {
        signer: you.address,
        signature,
        context,
      },
    ];

    await flow.connect(you).flow(flowStates[0].id, 1234, signedContexts, {});
  });

  it("should support expression which gates whether sender can validate their signed context", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const constants = [RAIN_FLOW_SENTINEL, 0, 1];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_SIGN_CONTEXT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfigStruct = {
      stateConfig: { sources, constants },
      flows: [
        { sources: [CAN_SIGN_CONTEXT(), CAN_FLOW(), sourceFlowIO], constants },
      ],
    };

    const flow = await flowDeploy(deployer, flowFactory, flowConfigStruct);

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

    const signedContexts: SignedContextStruct[] = [
      {
        signer: you.address,
        signature: new Uint8Array(),
        context: [],
      },
    ];

    await assertError(
      async () =>
        await flow
          .connect(you)
          .flow(flowStates[0].id, 1234, signedContexts, {}),
      "BAD_SIGNER",
      "did not prevent signed context validation when CAN_SIGN_CONTEXT set to false"
    );

    // no signed contexts does not throw error
    await flow.connect(you).flow(flowStates[0].id, 1234, [], {});
  });
});
