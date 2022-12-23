import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory } from "../../../typechain";
import { SignedContextStruct } from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import { getEvents } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow signed context tests", async function () {
  let flowFactory: FlowFactory;

  before(async () => {
    flowFactory = await flowFactoryDeploy();
  });

  it("should validate multiple signed contexts", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const goodSigner = signers[1];
    const badSigner = signers[2];

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfig = {
      stateConfig: { sources, constants },
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
    const goodSignature0 = await goodSigner.signMessage(arrayify(hash0));

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await goodSigner.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: goodSigner.address,
        signature: goodSignature0,
        context: context0,
      },
      {
        signer: goodSigner.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    await flow
      .connect(goodSigner)
      .flow(flowInitialized[0].dispatch, [1234], signedContexts0);

    // with bad signature in second signed context
    const badSignature = await badSigner.signMessage(arrayify(hash1));
    const signedContexts1: SignedContextStruct[] = [
      {
        signer: goodSigner.address,
        signature: goodSignature0,
        context: context0,
      },
      {
        signer: goodSigner.address,
        signature: badSignature,
        context: context0,
      },
    ];

    await assertError(
      async () =>
        await flow
          .connect(goodSigner)
          .flow(flowInitialized[0].dispatch, [1234], signedContexts1, {}),
      "INVALID_SIGNATURE",
      "did not error with signature from incorrect signer"
    );
  });

  it("should validate a signed context", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const goodSigner = signers[1];
    const badSigner = signers[2];

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfig = {
      stateConfig: { sources, constants },
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await flowDeploy(deployer, flowFactory, flowConfigStruct);

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const context = [1, 2, 3];
    const hash = solidityKeccak256(["uint256[]"], [context]);

    const goodSignature = await goodSigner.signMessage(arrayify(hash));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: goodSigner.address,
        signature: goodSignature,
        context,
      },
    ];

    await flow
      .connect(goodSigner)
      .flow(flowInitialized[0].dispatch, [1234], signedContexts0);

    // with bad signature
    const badSignature = await badSigner.signMessage(arrayify(hash));
    const signedContexts1: SignedContextStruct[] = [
      {
        signer: goodSigner.address,
        signature: badSignature,
        context,
      },
    ];

    await assertError(
      async () =>
        await flow
          .connect(goodSigner)
          .flow(flowInitialized[0].dispatch, [1234], signedContexts1, {}),
      "INVALID_SIGNATURE",
      "did not error with signature from incorrect signer"
    );
  });
});
