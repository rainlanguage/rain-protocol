import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory, FlowERC20 } from "../../../typechain";
import { SignedContextV1Struct } from "../../../typechain/contracts/flow/erc20/FlowERC20";
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
import { getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { FlowERC20Config } from "../../../utils/types/flow";

describe("FlowERC20 signed context tests", async function () {
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

  it("should validate multiple signed contexts", async () => {
    const signers = await ethers.getSigners();
    const [deployer, goodSigner, badSigner] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
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

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
    rainlang`
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

    const context = [1, 2, 3];
    const hash = solidityKeccak256(["uint256[]"], [context]);

    const goodSignature = await goodSigner.signMessage(arrayify(hash));

    const signedContexts0: SignedContextV1Struct[] = [
      {
        signer: goodSigner.address,
        signature: goodSignature,
        context,
      },
    ];

    await flow
      .connect(goodSigner)
      .flow(flowInitialized[0].evaluable, [1234], signedContexts0);

    // with bad signature
    const badSignature = await badSigner.signMessage(arrayify(hash));
    const signedContexts1: SignedContextV1Struct[] = [
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
          .flow(flowInitialized[0].evaluable, [1234], signedContexts1, {}),
      "InvalidSignature(0)",
      "did not error with signature from incorrect signer"
    );
  });

  it("should validate a signed context", async () => {
    const signers = await ethers.getSigners();
    const [deployer, goodSigner, badSigner] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
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

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
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
    const goodSignature0 = await goodSigner.signMessage(arrayify(hash0));

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await goodSigner.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextV1Struct[] = [
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
      .flow(flowInitialized[0].evaluable, [1234], signedContexts0);

    // with bad signature in second signed context
    const badSignature = await badSigner.signMessage(arrayify(hash1));
    const signedContexts1: SignedContextV1Struct[] = [
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
          .flow(flowInitialized[0].evaluable, [1234], signedContexts1, {}),
      "InvalidSignature(1)",
      "did not error with signature from incorrect signer"
    );
  });
});
