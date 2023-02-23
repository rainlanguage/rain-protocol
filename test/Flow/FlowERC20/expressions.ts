import { assert } from "chai";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import { SignedContextStruct } from "../../../typechain/contracts/flow/basic/Flow";
import { ContextEvent, FlowERC20 } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { basicDeploy } from "../../../utils";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import {  flowERC20Clone, flowERC20Implementation } from "../../../utils/deploy/flow/flowERC20/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs, getEvents } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { FlowERC20Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC20 expressions test", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should validate context emitted in context event", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];
    const bob = signers[2];

    const constants = [RAIN_FLOW_SENTINEL, RAIN_FLOW_ERC20_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      SENTINEL_ERC20(), // BURN END
      SENTINEL_ERC20(), // MINT END
    ]);

    const sources = [CAN_TRANSFER()];

    const flowConfigStruct: FlowERC20Config = {
      name: "Flow ERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [sourceFlowIO], constants }],
    }; 

    const { flow, flowCloneTx } = await flowERC20Clone(
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flowCloneTx,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const context0 = [1, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await bob.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
      {
        signer: bob.address,
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
        ethers.BigNumber.from(bob.address),
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
