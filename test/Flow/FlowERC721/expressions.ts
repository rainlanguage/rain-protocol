import { assert } from "chai";
import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import { SignedContextStruct } from "../../../typechain/contracts/flow/basic/Flow";
import {
  ContextEvent,
  FlowERC721,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { basicDeploy } from "../../../utils";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs, getEvents } from "../../../utils/events";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { FlowERC721Config } from "../../../utils/types/flow";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("FlowERC721 expressions tests", async function () {
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

  it("should validate context emitted in context event", async () => {
    const signers = await ethers.getSigners();
    const [deployer, alice, bob] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel721: ${RAIN_FLOW_ERC721_SENTINEL},
        
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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,

        /**
         * burns of this erc721 token
         */
        burnslist: sentinel721,
        
        /**
         * mints of this erc721 token
        */
        mintslist: sentinel721;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        
        /* sourceTokenURI */
        _: 1;
        `
    );

    const flowConfigStruct: FlowERC721Config = {
      name: "Flow ERC721",
      symbol: "F721",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
      baseURI: "https://www.rainprotocol.xyz/nft/",
    };

    const { flow } = await flowERC721Clone(
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
