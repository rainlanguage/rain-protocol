import { assert } from "chai";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import {
  FlowERC721,
  FlowERC721IOStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC721 } from "../../../utils/flow";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC721Config } from "../../../utils/types/flow";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("FlowERC721 tokenURI test", async function () {
  let cloneFactory: CloneFactory;
  let implementation: FlowERC721;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC721Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should generate tokenURI based on the expression result", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];
    const bob = signers[2];

    const tokenId = 0;

    const flowERC721IOMint: FlowERC721IOStruct = {
      mints: [
        {
          account: you.address,
          id: tokenId,
        },
      ],
      burns: [],
      flow: {
        native: [],
        erc20: [],
        erc721: [],
        erc1155: [],
      },
    };

    const flowERC721IOBurn: FlowERC721IOStruct = {
      mints: [],
      burns: [
        {
          account: you.address,
          id: tokenId,
        },
      ],
      flow: {
        native: [],
        erc20: [],
        erc721: [],
        erc1155: [],
      },
    };

    const { sources: sourceFlowIOMint, constants: constantsFlowIOMint } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel721: ${RAIN_FLOW_ERC721_SENTINEL},
        you: context<0 0>(),
        tokenid: ${flowERC721IOMint.mints[0].id},

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
        mintslist: sentinel721,
        _ _: you tokenid;
      `
      );
    const { sources: sourceFlowIOBurn, constants: constantsFlowIOBurn } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel721: ${RAIN_FLOW_ERC721_SENTINEL},
        bob: ${bob.address},
        tokenid: ${flowERC721IOBurn.burns[0].id},

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
        _ _: bob tokenid,
        
        /**
         * mints of this erc721 token
         */
        mintslist: sentinel721;
      `
      );

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        
        /* sourceTokenURI */
        me: context<0 1>(),
        you: context<0 0>(),
        token-uri-token-id: context<1 0>(),
        _: ensure(equal-to(erc-721-owner-of(me token-uri-token-id) you)) token-uri-token-id;
      `
    );

    const stateConfigStruct: FlowERC721Config = {
      baseURI: "https://www.rainprotocol.xyz/nft/",
      name: "FlowERC721",
      symbol: "F721",
      expressionConfig: {
        sources,
        constants: constants, // only needed for HANDLE_TRANSFER
      },
      flows: [
        {
          sources: sourceFlowIOMint,
          constants: constantsFlowIOMint,
        },
        {
          sources: sourceFlowIOBurn,
          constants: constantsFlowIOBurn,
        },
      ],
    };

    const { flow } = await flowERC721Clone(
      deployer,
      cloneFactory,
      implementation,
      stateConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const mintFlowId = flowInitialized[0].evaluable;

    const me = flow;

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, [1234], []);

    compareStructs(
      flowStructMint,
      fillEmptyAddressERC721(flowERC721IOMint, flow.address)
    );

    await flow.connect(you).flow(mintFlowId, [1234], []);

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const owner1 = await flow.ownerOf(tokenId);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(1));
    assert(owner1 === you.address);

    // Asserting tokenURI
    const tokenURI = await flow.connect(you).tokenURI(tokenId);
    const expectedTokenURI = stateConfigStruct.baseURI + tokenId;
    assert(
      tokenURI === expectedTokenURI,
      `Invalid token URI
        expected : ${expectedTokenURI}
        actual: ${tokenURI}`
    );

    // Should error if the caller is not the owner of tokenID
    await assertError(
      async () => await flow.connect(bob).tokenURI(tokenId),
      "Error: call revert exception",
      "Did not error when the caller is not the owner of given tokenID"
    );
  });
});
