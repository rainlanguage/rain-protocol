import { strict as assert } from "assert";
import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import { SignedContextV1Struct } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import {
  ContextEvent,
  FlowERC20,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC20Clone,
  flowERC20Implementation,
} from "../../../utils/deploy/flow/flowERC20/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs, getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import {
  opMetaHash,
  standardEvaluableConfig,
} from "../../../utils/interpreter/interpreter";
import { FlowERC20Config } from "../../../utils/types/flow";

describe("FlowERC20 expressions test", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should validate context emitted in context event", async () => {
    const signers = await ethers.getSigners();
    const [deployer, alice, bob] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},

        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,

        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,

        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}

          /* sourceHandleTransfer */
          _: 1;
          `
    );

    const flowConfigStruct: FlowERC20Config = {
      name: "Flow ERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

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
    const goodSignature1 = await bob.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextV1Struct[] = [
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
